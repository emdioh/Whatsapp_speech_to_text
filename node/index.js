// Required for terminal QRCode to authorize against WhatsApp.
const qrcode = require('qrcode-terminal');

// Required for Whatsapp Web connection.
const {Client, LocalAuth} = require('whatsapp-web.js');

const env = require('./environment');
const languages = require('./languages');
const speechWhisper = require('./speech_whisper');
const speechGoogle = require('./speech_google');
const speechOpenAI = require('./speech_openai');

// Setup options for the client and data path for the google chrome session
const client = new Client({
    authStrategy: new LocalAuth({dataPath: env.chromeDataPath}),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let chatTranscriptionsDisabled = {};
let globalTranscriptionDisabled = false;

async function init() {
    // Generates a QR code in the console for authentication.
    client.on('qr', qr => {
        qrcode.generate(qr, {small: true});
    });

    // Log successful client connection
    client.on('ready', () => {
        console.log('WhatsApp client is ready!');
    });

    // Reply to me and contacts
    client.on('message_create', async message => {
        let [contactName, trustedContact] = await ContactsWhiteList(message.from);
        if (message.fromMe) {
            trustedContact = true;
        }
        // Do not process the message if sender is not a trusted contact (in adress book or myself).
        if (!trustedContact) {
            return;
        }

        // Generate a date and hour based on the timestamp (just for debugging)
        const [formattedTime, formattedDate] = GetDate(message.timestamp);
        console.log('\x1b[32m%s:\x1b[0m %s %s', contactName, message.type, formattedTime);

        if (await ProcessCommandMessage(message)) {
            // Do not continue to process the message;
            return;
        }

        // Process message for voice transcription.
        await ProcessVoiceMessage(message);
    });

    // Initialize client
    console.log('Inititalize Whatsapp client...')
    await client.initialize();
}

// Contact white list. If the sender is your contact, the audio file will be transcript
async function ContactsWhiteList(Contact) {
    let ContactInfo = await client.getContactById(Contact);
    Contact = ContactInfo.name

    if (ContactInfo.isMyContact) {
        return [Contact, true];
    }
    return [Contact, false];
}

// Date and hour based on the timestamp of the mesage (unix time)
function GetDate(timestamp) {
    const date = new Date(timestamp * 1000);

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}`;
    const formattedTime = `${hours}:${minutes}:${seconds}`;

    return [formattedTime, formattedDate];
}

// This function handles the missing media in the chat by retrieving messages from the chat until the media is available
async function downloadQuotedMedia(quotedMsg, messageId, chat, maxRetries = 5) {
    let attachmentData = null;
    let counter = 10;

    while (!attachmentData && counter <= maxRetries) {
        try {
            const quotedMsgArr = await chat.fetchMessages({limit: counter});
            for (let i = 0; i < quotedMsgArr.length; i++) {
                if (quotedMsgArr[i].id._serialized === messageId) {
                    attachmentData = await quotedMsg.downloadMedia();
                    break;
                }
            }
        } catch (err) {
            console.warn(`Error fetching messages. Retrying in 5 seconds... (attempt ${counter}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        counter++;
    }

    if (!attachmentData) {
        console.log(`Could not download media after ${maxRetries} attempts.`);
    }

    return attachmentData;
}

async function getMessageToTranscribe(message) {
    if (!message) {
        return null;
    }

    // Only return a WhatsApp message if media was found.
    if (env.automaticTranscription && message.hasMedia) {
        return message;
    }

    if (message.body.trim() === env.transcriptionCommand && message.hasQuotedMsg) {
        const quotedMsg = await message.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            return quotedMsg;
        }
    }

    return null;
}

async function ProcessCommandMessage(message) {
    if (!message.fromMe) {
        // Only we are allowed to send commands to the bot!
        return;
    }

    const chat = await message.getChat();
    const command = message.body.trim().toLowerCase();
    if (command === '!help') {
        message.reply('*Transkription-Bot:*\n' +
            `- "!transcription-global=on/off": Transkription global an- oder abschalten.\n` +
            `- "!transcription=on/off": Transkription für diesen Chat an- oder abschalten.\n` +
            `- "!status": Aktuellen Status einsehen.\n`
                `- "!help": Diesen Hilfetext anzeigen.`);
        return true;
    }
    if (command === '!status') {
        const globalActive = globalTranscriptionDisabled ? 'deaktiviert' : 'aktiviert';
        const chatActive = chatTranscriptionsDisabled[chat.id._serialized] === true ? 'deaktiviert' : 'aktiviert';
        message.reply('*Transkription-Bot:*\n' +
            `- Globale Transkription ist ${globalActive}\n` +
            `- Transkription für diesen Chat ist ${chatActive}`);
        return true;
    }
    if (command === '!transcription-global=on' || command === '!transcription-global=off') {
        globalTranscriptionDisabled = command.endsWith('off');
        const active = globalTranscriptionDisabled ? 'deaktiviert' : 'aktiviert';
        message.reply(`*Transkription-Bot:*\nGlobale Transkription ist ab jetzt ${active}.`);
        return true;
    }
    if (command === '!transcription=on' || command === '!transcription=off') {
        chatTranscriptionsDisabled[chat.id._serialized] = command.endsWith('off');
        const active = command.endsWith('off') ? 'deaktiviert' : 'aktiviert';
        message.reply(`*Transkription-Bot:*\nTranskription in diesem Chat ist ab jetzt ${active}.`);
        return true;
    }

    return false;
}

async function ProcessVoiceMessage(message) {
    const voiceMessage = await getMessageToTranscribe(message);

    // The provided message and a possible quoted message weren't of type voice message.
    if (!voiceMessage) {
        return;
    }

    // Bail out early if the message does not contain audio.
    if (!voiceMessage.type.includes("ptt") && !voiceMessage.type.includes("audio")) {
        return;
    }

    const chat = await message.getChat();
    const messageId = voiceMessage.id._serialized;

    // Do not transcribe any chats if transcription got globally disabled.
    if (globalTranscriptionDisabled) {
        return;
    }

    // Do not transcribe individual chats where transcription got disabled.
    if (chatTranscriptionsDisabled[chat.id._serialized] === true) {
        return;
    }

    // If it is a voice message, we download it and send it to the api
    const attachmentData = await downloadQuotedMedia(voiceMessage, messageId, chat, maxRetries = 1000);
    if (!attachmentData) {
        message.reply(languages.text.couldNotDownloadAudio);
        return;
    }

    // Decode the base64 data (The data is a base64 string because thats the way WhatsApp.js handles media)
    const binaryVoiceBuffer = Buffer.from(attachmentData.data, 'base64');
    let callback = null;
    if (env.speechRecognitionSystem === 'google') {
        callback = speechGoogle.transcribe;
    } else if (env.speechRecognitionSystem === 'openai') {
        callback = speechOpenAI.transcribe;
    } else {
        callback = speechWhisper.transcribe;
    }
    callback(binaryVoiceBuffer, messageId, message)
        .then((body) => {
            const data = JSON.parse(body);
            for (const result of data.results) {
                const transcript = result.transcript;
                chat.sendMessage(languages.text.successHeader + transcript, {
                    quotedMessageId: messageId
                });
            }
        })
        .catch((err) => {
            console.error(err);
            chat.sendMessage(languages.text.errorHeader, {
                quotedMessageId: messageId
            });
        });
}

// Start the script.
init();