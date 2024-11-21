const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const googleTTS = require('google-tts-api'); // Text-to-Speech API
const ffmpeg = require('ffmpeg-static'); // FFmpeg binary

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = ''; // Use environment variable for the bot token

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

const handleTTS = async (message, text, lang = 'en') => {
  if (text.length > 300) {
    message.reply('The message is too long. Please provide a message with at most 300 characters.');
    return;
  }

  if (message.member.voice.channel) {
    try {
      const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const url = googleTTS.getAudioUrl(text, {
        lang: lang, // Use the extracted or default language code
        slow: false,
        host: 'https://translate.google.com',
      });

      const player = createAudioPlayer();
      const resource = createAudioResource(url, {
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
    let lang = 'en'; // Default language
    let text = args.join(' ');

    // Check if the last argument is a language code prefixed with a hyphen
    if (args.length > 1 && args[args.length - 1].startsWith('/')) {
      lang = args.pop().substring(1); // Extract the language code without the hyphen
      text = args.join(' '); // Join the remaining args as the text
    }

    if (!text) {
      message.reply('Please provide a message to convert to speech.');
      return;
    }

    await handleTTS(message, text, lang);

  } else if (message.content.startsWith('!longtts')) {
    const args = message.content.split(' ');
    let lang = 'en'; // Default language

    // Check if a language code is provided
    if (args.length > 1) {
      lang = args[1];
    }

    longTTSUsers.set(message.author.id, lang);
    message.reply(`Long TTS mode enabled with language ${lang}. I will read out everything you type until you type !stop.`);

  } else if (message.content === '!stop') {
    longTTSUsers.delete(message.author.id);
    message.reply('Long TTS mode disabled.');

  } else if (longTTSUsers.has(message.author.id)) {
    const lang = longTTSUsers.get(message.author.id);
    await handleTTS(message, message.content, lang);

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