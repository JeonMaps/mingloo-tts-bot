const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const ffmpeg = require('ffmpeg-static'); 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = ''; 

client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
});

let inactivityTimeout;
const longTTSUsers = new Map();

const resetInactivityTimeout = (connection) => {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    connection.destroy();
    inactivityTimeout = null;
  }, 60000); // 1 minute of inactivity
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
      playNext(); // Start playing the first chunk

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

    await handleTTS(message, text, lang);

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
    if (!message.content.startsWith('-') && !message.content.startsWith(':') && !message.content.startsWith('<') && !urlRegex.test(message.content)) {
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
});

client.login(TOKEN);