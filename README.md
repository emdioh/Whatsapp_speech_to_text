# Whatsapp Speech To Text
Speech to text in Whatsapp using [Whisper](https://github.com/openai/whisper) and [Whatsapp-Web.js](https://github.com/pedroslopez/whatsapp-web.js), running on Docker.   
Originally the program was using Google Cloud Speech.   
   
<p align="left">
  <img src="https://github.com/altbert/Whatsapp_speech_to_text/raw/main/media/Screenshot.jpg" width="400" title="Example">
</p>
   
   
### Description
Once authenticated on Whatsapp Web, the worker will transcribe, using Whisper, all messages received from a contact in your contact book, and you.   
If you want to contribute just send a pull request   
   
### Usage
Just reply to the audio message you want to transcribe with **!tran**

### Running the server
- To build the images run ```docker-compose build```
- To run the containers run ```docker-compose up``` (Do not detach, the qr will be displayed in the terminal)

### Configuration
- To chose the model you want to use edit the env variable called **MODEL_VERSION** located in the docker-compose.yml file under the whisper_api container config. Default model: **tiny**
- To configure the path and the api address edit the environment variables inside the ```docker-compose.yml``` file. The default values are: 
  - HOST_ADDRESS=whisper_api
  - CHROME_DATA_PATH="/app/data/"
- If you want to use the code outside docker, you just have to edit the env variables in the index.js file.
- If you are using a GPU add and edit, to your needs, the following code to the **whisper_api** container   
    ``` yml
        deploy:
        resources:
            reservations:
            devices:
                - driver: nvidia
                count: 1
                capabilities: [gpu]
    ```
- Editing the variables response ```responseMsgHeader``` and ```responseMsgHeaderError``` inside the **node/index.js**. You can edit the header of the automatic response.

### TODO
- [x] ~~Only transcribe if the audio is replied with "!tran"~~
- [x] ~~Send "!tran" from my chat and also transcribe the audio. For now only messages send by contacts will be transcribed.~~
- [ ] Save the models locally
- [ ] Maybe use https://github.com/ahmetoner/whisper-asr-webservice as the api
