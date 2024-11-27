
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const ffmpeg = require('ffmpeg-static');
const PlayHT = require('playht');
const fs = require('fs');
const util = require('util');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = '';
const PLAY_HT_API_KEY = ''
const PLAY_HT_USER_ID = ''
const FRAN_ID = 's3://voice-cloning-zero-shot/420de149-869a-4968-a03c-df32931a367a/original/manifest.json'
const KISU_ID = 's3://voice-cloning-zero-shot/7b194830-2ce8-4ef7-90d6-05b99a6e7674/original/manifest.json'
const SHIMOL_ID = 's3://voice-cloning-zero-shot/5269c9a2-f75e-43fa-9045-7d4db6f8b5db/original/manifest.json'

PlayHT.init({
  apiKey: PLAY_HT_API_KEY,
  userId: PLAY_HT_USER_ID,
  defaultVoiceEngine: 'PlayHT2.0'
});

client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
});

let inactivityTimeout;
const longTTSUsers = new Map();

const cleanText = (text) => {
  return text.replace(/!\S+/g, '').trim();
};

const resetInactivityTimeout = (connection) => {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    connection.destroy();
    inactivityTimeout = null;
  }, 6000000);
};

const splitText = (text, maxLength) => {
  const regex = new RegExp(`.{1,${maxLength}}`, 'g');
  return text.match(regex);
};

const handleTTS = async (message, text, lang = 'en') => {
  if (text.length > 500) {
    message.reply('The message is too long. Please provide a message with at most 500 characters.');
    return;
  }

  if (message.member.voice.channel) {
    try {
      const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const textChunks = splitText(text, 200);
      const urls = textChunks.map(chunk => googleTTS.getAudioUrl(chunk, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
      }));

      const player = createAudioPlayer();

      const playNext = () => {
        if (urls.length === 0) {
          resetInactivityTimeout(connection);
          return;
        }

        const url = urls.shift();
        const resource = createAudioResource(url, {
          inputType: ffmpeg,
        });
        player.play(resource);
      };

      player.on(AudioPlayerStatus.Idle, playNext);

      connection.subscribe(player);
      playNext();

    } catch (error) {
      console.error('Error connecting to voice channel:', error);
      message.reply('Attachments cannot be played by the bot.');
    }
  } else {
    message.reply('You need to join a voice channel first!');
  }
};

const handleCustomVoiceTTS = async (message, text, voiceId, lang = 'en') => {
  if (text.length > 1000) {
    message.reply('The message is too long. Please provide a message with at most 500 characters.');
    return;
  }

  if (message.member.voice.channel) {
    try {
      const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      // const response = await playht.generateTTS({
      //   text: text,
      //   voice: 'en_us_male', // You can specify the voice here
      //   quality: 'high',
      // });

      // const audioUrl = response.audioUrl;

      PlayHT.init({
        apiKey: PLAY_HT_API_KEY,
        userId: PLAY_HT_USER_ID,
        defaultVoiceId: voiceId,
        defaultVoiceEngine: 'PlayHT2.0'
      });

      const cleanedText = cleanText(text);

      const generated = await PlayHT.generate(cleanedText)

      const { audioUrl } = generated;

      const player = createAudioPlayer();
      const resource = createAudioResource(audioUrl, {
        inputType: ffmpeg,
      });
      player.play(resource);

      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => {
        resetInactivityTimeout(connection);
      });

      resetInactivityTimeout(connection); // Start the inactivity timer

    } catch (error) {
      console.error('Error connecting to voice channel:', error);
      message.reply('There was an error connecting to the voice channel.');
    }
  } else {
    message.reply('You need to join a voice channel first!');
  }
};

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!tts')) {
    const args = message.content.slice(5).trim().split(' ');
    let lang = 'en';
    let text = args.join(' ');

    if (args.length > 1 && args[args.length - 1].startsWith('/')) {
      lang = args.pop().substring(1);
      text = args.join(' ');
    }

    if (!text) {
      message.reply('Please provide a message to convert to speech.');
      return;
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (!text.startsWith('-') && !text.startsWith(':') && !text.startsWith('!') && !text.startsWith('<') && !urlRegex.test(text)) {
      await handleTTS(message, text, lang);
    }

  } else if (message.content.startsWith('!longtts')) {
    const args = message.content.split(' ');
    let lang = 'en';

    if (args.length > 1) {
      lang = args[1];
    }

    longTTSUsers.set(message.author.id, lang);
    message.reply(`Long TTS mode enabled with language ${lang}. I will read out everything you type until you type !stop.`);

  } else if (message.content === '!stop') {
    longTTSUsers.delete(message.author.id);
    message.reply('Long TTS mode disabled.');

  } else if (longTTSUsers.has(message.author.id)) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (!message.content.startsWith('-') && !message.content.startsWith('!') && !message.content.startsWith(':') && !message.content.startsWith('<') && !urlRegex.test(message.content)) {
      const lang = longTTSUsers.get(message.author.id);
      await handleTTS(message, message.content, lang);
    }

  } else if (message.content === '!leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      message.reply('Disconnected from the voice channel.');
    } else {
      message.reply('I am not connected to any voice channel.');
    }
  } 
  else if (message.content.startsWith('!kisutts')) {
    processTTSCommand(message, '!kisutts', KISU_ID);
  } else if (message.content.startsWith('!frantts')) {
    processTTSCommand(message, '!frantts', FRAN_ID);
  } else if (message.content.startsWith('!shimoltts')) {
    processTTSCommand(message, '!shimoltts', SHIMOL_ID);
  }
});

const processTTSCommand = async (message, prefix, voiceId) => {
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(' ');
    let lang = 'en';
    let text = args.join(' ');

    if (args.length > 1 && args[args.length - 1].startsWith('/')) {
      lang = args.pop().substring(1);
      text = args.join(' ');
    }

    if (!text) {
      message.reply('Please provide a message to convert to speech.');
      return;
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (
      !text.startsWith('-') &&
      !text.startsWith(':') &&
      !text.startsWith('!') &&
      !text.startsWith('<') &&
      !urlRegex.test(text)
    ) {
      await handleCustomVoiceTTS(message, text, voiceId, lang);
    }
  }
};

client.login(TOKEN);