const env = require('./environment');
const storage = require('node-persist');


class State {
  // Key = Voice Message ID, Value = Response from bot.
  #transcribedMessages = {};
  // Track message id by order of insertion.
  #transcribedMessagesIds = [];
  // Max number of messages to track.
  transcribedMessagesCacheSize = 100;

  // Set of chat with transcription disabled
  #chatTranscriptionsDisabled = {};
  globalTranscriptionDisabled = false;

  #initDone = false;

  constructor(){
    this.#chatTranscriptionsDisabled = {};
    console.log(this.#chatTranscriptionsDisabled.constructor.name);
  }

  async init(){
    if (!this.#initDone){
      await storage.init(env.saveStateFile);
    }
    this.#initDone = true;
  }


  async save() {
    storage.setItem('transcribedMessages', this.#transcribedMessages);
    storage.setItem('transcribedMessagesIds', this.#transcribedMessagesIds);
    storage.setItem('chatTranscriptionsDisabled', this.#chatTranscriptionsDisabled);
    storage.setItem('globalTranscriptionDisabled', this.globalTranscriptionDisabled);
    console.log("State saved (async)");
  }

  async load() {
    this.#transcribedMessages = await storage.setItem('transcribedMessages');
    this.#transcribedMessagesIds = await storage.setItem('transcribedMessagesIds');
    this.#chatTranscriptionsDisabled = await storage.setItem('chatTranscriptionsDisabled');
    this.globalTranscriptionDisabled = await storage.setItem('globalTranscriptionDisabled');
    console.log("State loaded");
  }

  getMessage(id){
    return this.#transcribedMessages[id];  
  }

  hasMessage(id){
    return id in this.#transcribedMessages; 
  }

  trackMessage(id, data){
    this.#transcribedMessages[id] = data;
    this.#transcribedMessagesIds.push(id);
    if (this.#transcribedMessagesIds.length > transcribedMessagesCacheSize){
      let toRemove = this.#transcribedMessagesIds.shift();
      delete this.#transcribedMessages[toRemove];
    }
    this.save();
  }

  isChatTranscriptionDisabled(chatId){
    return chatId in this.#chatTranscriptionsDisabled;
  }

  disableChatTranscription(chatId){
    this.#chatTranscriptionsDisabled[chatId] = true;
    this.save();
  }

  enableChatTranscription(chatId){
    if (chatId in this.#chatTranscriptionsDisabled) {
      delete this.#chatTranscriptionsDisabled[chatId];
    }
    this.save();
  }
}

const _state = new State();
exports.state = _state;
