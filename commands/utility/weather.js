const axios = require('axios');
const config = require('../../config');

// OpenWeatherMap API Configuration
const API_KEY = "81b37bb82aeaf67bc328dc8e1815dbcd";
const BASE_URL = "http://api.openweathermap.org/data/2.5/weather";

module.exports = {
    name: 'weather',
    aliases: ['wth', 'temp', 'climate', 'forecast'],
    description: 'Get current weather information for any city',
    usage: 'weather <city> [country code]',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply, config);
            return;
        }

        // Parse arguments
        let city = '';
        let countryCode = null;

        // Check if last argument is a 2-letter country code
        const lastArg = args[args.length - 1];
        if (lastArg && lastArg.length === 2 && lastArg.match(/^[A-Za-z]{2}$/)) {
            countryCode = lastArg.toUpperCase();
            city = args.slice(0, -1).join(' ');
        } else {
            city = args.join(' ');
        }

        if (!city) {
            await reply('❌ Please provide a city name!');
            return;
        }

        await react('⏳');
        const processingMsg = await reply(`⛅ *Fetching weather for:* ${city}${countryCode ? `, ${countryCode}` : ''}...`);

        try {
            const weatherData = await getWeatherData(city, countryCode);

            if (!weatherData) {
                // City not found
                const suggestions = await getCitySuggestions(city);
                
                let errorMsg = `❌ *City not found:* "${city}"\n\n`;
                
                if (suggestions.length > 0) {
                    errorMsg += `*Did you mean:*\n`;
                    suggestions.slice(0, 5).forEach(suggestion => {
                        errorMsg += `• ${suggestion}\n`;
                    });
                    errorMsg += `\n*Try:* \`${config.prefix}weather <city> <country code>\`\n`;
                    errorMsg += `*Example:* \`${config.prefix}weather London UK\``;
                } else {
                    errorMsg += `Make sure the city name is correct.\n`;
                    errorMsg += `*Example:* \`${config.prefix}weather London UK\``;
                }

                await sock.sendMessage(from, {
                    text: errorMsg,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }

            // Format and send weather info with local time
            const weatherMessage = await formatWeatherMessage(weatherData);
            
            // Add weather condition emoji as reaction
            const weatherEmoji = getWeatherEmoji(weatherData.weather[0].main);
            await react(weatherEmoji);

            await sock.sendMessage(from, {
                text: weatherMessage,
                edit: processingMsg.key
            });

        } catch (error) {
            console.error('Weather API error:', error);
            
            await sock.sendMessage(from, {
                text: `❌ *Failed to fetch weather*\n\nError: ${error.message}`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply, config) {
    await reply(`🌤️ *Weather Information*\n\n` +
                `*Usage:*\n` +
                `• \`${config.prefix}weather <city>\` - Get weather\n` +
                `• \`${config.prefix}weather <city> <country code>\` - Specify country\n\n` +
                `*Examples:*\n` +
                `• \`${config.prefix}weather London\`\n` +
                `• \`${config.prefix}weather New York US\`\n` +
                `• \`${config.prefix}weather Paris FR\`\n` +
                `• \`${config.prefix}weather Karachi PK\``);
}

async function getWeatherData(city, countryCode = null) {
    const query = countryCode ? `${city},${countryCode}` : city;
    
    const params = {
        'q': query,
        'appid': API_KEY,
        'units': 'metric' // Use 'imperial' for Fahrenheit
    };

    try {
        const response = await axios.get(BASE_URL, {
            params,
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.data && response.data.cod === 200) {
            return response.data;
        }
        return null;
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // City not found
        }
        throw error; // Other errors
    }
}

async function getCitySuggestions(query) {
    // Common cities for suggestions
    const commonCities = {
        'l': ['London, UK', 'Los Angeles, US', 'Lahore, PK', 'Lisbon, PT'],
        'n': ['New York, US', 'New Delhi, IN', 'Naples, IT', 'Nairobi, KE'],
        'p': ['Paris, FR', 'Prague, CZ', 'Portland, US', 'Perth, AU'],
        't': ['Tokyo, JP', 'Toronto, CA', 'Tehran, IR', 'Tunis, TN'],
        'c': ['Chicago, US', 'Cairo, EG', 'Cape Town, ZA', 'Chennai, IN'],
        'm': ['Mumbai, IN', 'Moscow, RU', 'Madrid, ES', 'Melbourne, AU'],
        'k': ['Karachi, PK', 'Kolkata, IN', 'Kiev, UA', 'Kuala Lumpur, MY'],
        'd': ['Dubai, AE', 'Delhi, IN', 'Dublin, IE', 'Denver, US'],
        's': ['Sydney, AU', 'Singapore, SG', 'Seoul, KR', 'Shanghai, CN'],
        'b': ['Bangkok, TH', 'Berlin, DE', 'Barcelona, ES', 'Boston, US']
    };

    const firstChar = query[0]?.toLowerCase() || '';
    return commonCities[firstChar] || [];
}

async function formatWeatherMessage(data) {
    const main = data.main;
    const weather = data.weather[0];
    const wind = data.wind;
    const sys = data.sys;
    
    // Get timezone offset in seconds (from API)
    const timezoneOffset = data.timezone || 0; // seconds from UTC
    
    // Create current time in city's timezone
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000); // Convert to UTC
    const cityTime = new Date(utcTime + (timezoneOffset * 1000));
    
    // Format date in city's timezone
    const cityDate = cityTime.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: 'UTC' // Use UTC as base since we already applied offset
    });
    
    // Format time in city's timezone
    const cityTimeString = cityTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    });

    // Convert sunrise/sunset timestamps to city's local time
    const sunrise = new Date((sys.sunrise + timezoneOffset) * 1000);
    const sunset = new Date((sys.sunset + timezoneOffset) * 1000);
    
    const sunriseTime = sunrise.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    });
    
    const sunsetTime = sunset.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    });

    // Get weather emoji
    const weatherEmoji = getWeatherEmoji(weather.main);

    // Build the message
    let message = `🌍 *Weather for ${data.name}, ${sys.country}*\n`;
    message += `📅 ${cityDate}\n`;
    message += `⏰ ${cityTimeString} (Local Time)\n\n`;

    message += `${weatherEmoji} *${weather.main}* - ${weather.description}\n\n`;

    message += `🌡️ *Temperature:* ${main.temp.toFixed(1)}°C\n`;
    message += `🤔 *Feels like:* ${main.feels_like.toFixed(1)}°C\n`;
    message += `📊 *Min/Max:* ${main.temp_min.toFixed(1)}°C / ${main.temp_max.toFixed(1)}°C\n\n`;

    message += `💧 *Humidity:* ${main.humidity}%\n`;
    message += `💨 *Wind Speed:* ${wind.speed} m/s`;
    
    if (wind.gust) {
        message += ` (gusts ${wind.gust} m/s)`;
    }
    message += '\n';

    if (main.pressure) {
        message += `📈 *Pressure:* ${main.pressure} hPa\n`;
    }

    message += `\n🌅 *Sunrise:* ${sunriseTime}\n`;
    message += `🌇 *Sunset:* ${sunsetTime}\n`;

    // Add visibility if available
    if (data.visibility) {
        const visibilityKm = (data.visibility / 1000).toFixed(1);
        message += `👁️ *Visibility:* ${visibilityKm} km\n`;
    }

    // Add timezone info
    const timezoneHours = timezoneOffset / 3600;
    const timezoneStr = timezoneHours > 0 ? `UTC+${timezoneHours}` : `UTC${timezoneHours}`;
    message += `\n📍 *Timezone:* ${timezoneStr}\n`;

    message += `\n_Data from OpenWeatherMap_`;
    
    return message;
}

function getWeatherEmoji(weatherMain) {
    const emojiMap = {
        'Clear': '☀️',
        'Sunny': '☀️',
        'Clouds': '☁️',
        'Few clouds': '⛅',
        'Scattered clouds': '☁️',
        'Broken clouds': '☁️',
        'Overcast clouds': '☁️',
        'Rain': '🌧️',
        'Light rain': '🌦️',
        'Moderate rain': '🌧️',
        'Heavy rain': '🌧️',
        'Drizzle': '🌧️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Light snow': '❄️',
        'Heavy snow': '❄️',
        'Mist': '🌫️',
        'Fog': '🌫️',
        'Haze': '🌫️',
        'Smoke': '🌫️',
        'Dust': '🌫️',
        'Sand': '🌫️',
        'Ash': '🌫️',
        'Squall': '💨',
        'Tornado': '🌪️'
    };
    
    return emojiMap[weatherMain] || '🌡️';
}
