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

const resetInactivityTimeout = (connection) => {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    connection.destroy();
    inactivityTimeout = null;
  }, 60000); // 1 minute of inactivity
};

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!tts')) {
    const args = message.content.slice(5).trim().split(' ');
    const lang = args.shift(); // Extract the language code
    const text = args.join(' '); // Join the remaining args as the text

    if (!text) {
      message.reply('Please provide a message to convert to speech.');
      return;
    }

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
          lang: lang || 'en', // Default to English if no language code is provided
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