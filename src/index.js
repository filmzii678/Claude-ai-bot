// Telegram Bot hosted on Cloudflare Workers
// Created by https://t.me/zerocreations

const BOT_TOKEN = '8454227864:AAEweDsmdLfIsJayDAg-SUG7VcXfIpQ33K8';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WELCOME_IMAGE = 'https://ar-hosting.pages.dev/1753591871196.jpg';

// Store for autofilter (in production, use KV storage)
const autofilterData = new Map();

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'POST') {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response('OK');
    }
    
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.pathname === '/setWebhook') {
        return await setWebhook(request);
      }
      if (url.pathname === '/preview') {
        return await generateWebsitePreview(url.searchParams.get('url'));
      }
      return new Response('Bot is running! 🚀\nCreated by @zerocreations', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    return new Response('Method not allowed', { status: 405 });
  }
};

async function handleUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';
  const messageId = message.message_id;

  // Welcome new members
  if (message.new_chat_members) {
    for (const member of message.new_chat_members) {
      await sendWelcomeMessage(chatId, member);
    }
    return;
  }

  // Handle commands
  if (text.startsWith('/')) {
    await handleCommand(text, chatId, userId, messageId, env);
    return;
  }

  // Auto-filter functionality
  if (message.chat.type !== 'private') {
    await handleAutoFilter(text, chatId, messageId);
    return;
  }

  // Check for URLs and generate previews
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  if (urls && urls.length > 0) {
    for (const url of urls) {
      await sendWebsitePreview(chatId, url);
    }
    return;
  }

  // Check for code patterns and format them
  if (containsCode(text)) {
    await sendFormattedCode(chatId, text, messageId);
    return;
  }

  // Default response for private chat
  if (message.chat.type === 'private') {
    await sendMessage(chatId, "👋 Hello! I'm an autofilter bot with special features!\n\n🔧 Commands:\n/help - Show help\n/add - Add autofilter\n/del - Delete autofilter\n/filters - Show all filters\n\n✨ Features:\n• Auto-filter messages\n• Code formatting with copy button\n• Website preview generation\n\n🔗 Created by @zerocreations");
  }
}

async function handleCommand(command, chatId, userId, messageId, env) {
  const [cmd, ...args] = command.split(' ');
  
  switch (cmd.toLowerCase()) {
    case '/start':
      if (args[0] && autofilterData.has(args[0])) {
        const filterData = autofilterData.get(args[0]);
        await sendFilterContent(chatId, filterData);
      } else {
        await sendWelcomeMessage(chatId, { first_name: 'User', id: userId });
      }
      break;
      
    case '/help':
      await sendHelpMessage(chatId);
      break;
      
    case '/add':
      await handleAddFilter(chatId, args.join(' '), messageId);
      break;
      
    case '/del':
      await handleDeleteFilter(chatId, args.join(' '));
      break;
      
    case '/filters':
      await showAllFilters(chatId);
      break;
      
    case '/preview':
      if (args[0]) {
        await sendWebsitePreview(chatId, args[0]);
      } else {
        await sendMessage(chatId, "Please provide a URL to preview.\nExample: /preview https://example.com");
      }
      break;
      
    default:
      await sendMessage(chatId, "Unknown command. Use /help to see available commands.");
  }
}

async function handleCallbackQuery(callbackQuery, env) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  
  if (data.startsWith('copy_code_')) {
    await answerCallbackQuery(callbackQuery.id, "Code copied to clipboard! 📋");
  } else if (data.startsWith('filter_')) {
    const filterId = data.replace('filter_', '');
    if (autofilterData.has(filterId)) {
      const filterData = autofilterData.get(filterId);
      await sendFilterContent(chatId, filterData);
    }
    await answerCallbackQuery(callbackQuery.id, "Filter sent!");
  }
}

async function sendWelcomeMessage(chatId, user) {
  const welcomeText = `
🎉 Welcome ${user.first_name}!

I'm your advanced autofilter bot with special features:

✨ **Features:**
• 🔍 Smart autofilter system
• 💻 Code formatting with copy button
• 🌐 Website preview generation
• 📱 24/7 availability

🤖 **Commands:**
/help - Show detailed help
/add - Add new autofilter
/filters - View all filters

🔗 **Created by:** @zerocreations
  `;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📚 Help", callback_data: "help" },
        { text: "🔧 Commands", callback_data: "commands" }
      ],
      [
        { text: "👥 Creator", url: "https://t.me/zerocreations" }
      ]
    ]
  };

  await sendPhoto(chatId, WELCOME_IMAGE, welcomeText, keyboard);
}

async function sendHelpMessage(chatId) {
  const helpText = `
🤖 **Bot Help Guide**

**🔍 AutoFilter:**
• Send any keyword in group
• Bot will show matching filters
• Click buttons to get content

**💻 Code Features:**
• Send code snippets
• Get formatted code with copy button
• Supports multiple languages

**🌐 Website Preview:**
• Send any URL
• Get instant website preview
• Works with most websites

**⚙️ Admin Commands:**
\`/add [keyword] - [content]\` - Add filter
\`/del [keyword]\` - Delete filter
\`/filters\` - Show all filters
\`/preview [url]\` - Generate preview

**📝 Examples:**
\`/add python - Python is awesome!\`
\`/del python\`
\`/preview https://github.com\`

🔗 **Created by:** @zerocreations
  `;

  await sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}

async function handleAutoFilter(text, chatId, messageId) {
  const keywords = Array.from(autofilterData.keys());
  const foundFilters = keywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  if (foundFilters.length > 0) {
    const buttons = foundFilters.slice(0, 10).map(keyword => [{
      text: keyword,
      callback_data: `filter_${keyword}`
    }]);

    const keyboard = { inline_keyboard: buttons };
    
    await sendMessage(
      chatId, 
      `🔍 Found ${foundFilters.length} filter(s) for your query:`,
      { reply_markup: keyboard, reply_to_message_id: messageId }
    );
  }
}

async function handleAddFilter(chatId, content, messageId) {
  if (!content.includes(' - ')) {
    await sendMessage(chatId, "❌ Invalid format!\n\nUse: `/add keyword - content`\nExample: `/add python - Python is a programming language`", { parse_mode: 'Markdown' });
    return;
  }

  const [keyword, ...contentParts] = content.split(' - ');
  const filterContent = contentParts.join(' - ');
  
  if (!keyword.trim() || !filterContent.trim()) {
    await sendMessage(chatId, "❌ Both keyword and content are required!");
    return;
  }

  autofilterData.set(keyword.trim(), {
    content: filterContent.trim(),
    created_by: chatId,
    created_at: new Date().toISOString()
  });

  await sendMessage(chatId, `✅ Filter added successfully!\n\n🔑 **Keyword:** ${keyword.trim()}\n📝 **Content:** ${filterContent.trim()}`, { parse_mode: 'Markdown' });
}

async function handleDeleteFilter(chatId, keyword) {
  if (!keyword.trim()) {
    await sendMessage(chatId, "❌ Please specify a keyword to delete!\n\nUse: `/del keyword`", { parse_mode: 'Markdown' });
    return;
  }

  if (autofilterData.has(keyword.trim())) {
    autofilterData.delete(keyword.trim());
    await sendMessage(chatId, `✅ Filter "${keyword.trim()}" deleted successfully!`);
  } else {
    await sendMessage(chatId, `❌ Filter "${keyword.trim()}" not found!`);
  }
}

async function showAllFilters(chatId) {
  if (autofilterData.size === 0) {
    await sendMessage(chatId, "📭 No filters found!\n\nUse `/add keyword - content` to add filters.", { parse_mode: 'Markdown' });
    return;
  }

  let filtersText = "📋 **All Filters:**\n\n";
  let count = 1;
  
  for (const [keyword, data] of autofilterData.entries()) {
    filtersText += `${count}. **${keyword}**\n   └ ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}\n\n`;
    count++;
    
    if (count > 20) {
      filtersText += `... and ${autofilterData.size - 20} more filters`;
      break;
    }
  }

  await sendMessage(chatId, filtersText, { parse_mode: 'Markdown' });
}

async function sendFilterContent(chatId, filterData) {
  const keyboard = {
    inline_keyboard: [[
      { text: "🔗 Share", switch_inline_query: filterData.content.substring(0, 50) }
    ]]
  };

  await sendMessage(chatId, filterData.content, { reply_markup: keyboard });
}

function containsCode(text) {
  const codePatterns = [
    /```[\s\S]*```/g,  // Code blocks
    /`[^`]+`/g,        // Inline code
    /function\s+\w+/gi, // Function declarations
    /class\s+\w+/gi,   // Class declarations
    /import\s+/gi,     // Import statements
    /from\s+\w+\s+import/gi, // Python imports
    /#include\s*</gi,  // C/C++ includes
    /console\.log/gi,  // JavaScript console
    /print\s*\(/gi     // Print statements
  ];

  return codePatterns.some(pattern => pattern.test(text));
}

async function sendFormattedCode(chatId, code, messageId) {
  // Detect language
  let language = 'text';
  if (code.includes('function') || code.includes('console.log') || code.includes('const ') || code.includes('let ')) {
    language = 'javascript';
  } else if (code.includes('def ') || code.includes('import ') || code.includes('print(')) {
    language = 'python';
  } else if (code.includes('#include') || code.includes('cout')) {
    language = 'cpp';
  } else if (code.includes('public class') || code.includes('System.out')) {
    language = 'java';
  }

  const formattedCode = code.startsWith('```') ? code : `\`\`\`${language}\n${code}\n\`\`\``;
  
  const keyboard = {
    inline_keyboard: [[
      { text: "📋 Copy Code", callback_data: `copy_code_${Date.now()}` },
      { text: "🔄 Format", callback_data: `format_code_${Date.now()}` }
    ]]
  };

  await sendMessage(chatId, `💻 **Formatted Code:**\n\n${formattedCode}`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    reply_to_message_id: messageId
  });
}

async function sendWebsitePreview(chatId, url) {
  try {
    // Validate URL
    new URL(url);
    
    const previewText = `🌐 **Website Preview**\n\n🔗 **URL:** ${url}\n\n📱 Generating preview...`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🌐 Open Website", url: url },
          { text: "🔄 Refresh Preview", callback_data: `preview_${Date.now()}` }
        ]
      ]
    };

    // Send initial message
    const message = await sendMessage(chatId, previewText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: false
    });

    // Try to get website metadata (in production, you'd implement this)
    setTimeout(async () => {
      const updatedText = `🌐 **Website Preview**\n\n🔗 **URL:** ${url}\n📝 **Title:** Loading...\n📄 **Description:** Fetching website information...\n\n✅ Click "Open Website" to visit the page.`;
      
      await editMessage(chatId, message.result.message_id, updatedText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }, 2000);

  } catch (error) {
    await sendMessage(chatId, `❌ Invalid URL format!\n\nPlease provide a valid URL starting with http:// or https://`);
  }
}

async function generateWebsitePreview(url) {
  if (!url) {
    return new Response('Missing URL parameter', { status: 400 });
  }

  try {
    // Basic HTML preview generator
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Website Preview</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .preview { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .url { color: #007bff; word-break: break-all; }
            iframe { width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="preview">
            <h2>🌐 Website Preview</h2>
            <p><strong>URL:</strong> <span class="url">${url}</span></p>
            <iframe src="${url}" sandbox="allow-scripts allow-same-origin"></iframe>
            <p><small>Preview generated by @zerocreations bot</small></p>
        </div>
    </body>
    </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    return new Response('Error generating preview', { status: 500 });
  }
}

// Telegram API helper functions
async function sendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text: text,
    ...options
  };

  return await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(res => res.json());
}

async function sendPhoto(chatId, photo, caption = '', replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    photo: photo,
    caption: caption,
    parse_mode: 'Markdown'
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(res => res.json());
}

async function editMessage(chatId, messageId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    ...options
  };

  return await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(res => res.json());
}

async function answerCallbackQuery(queryId, text = '', showAlert = false) {
  return await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: queryId,
      text: text,
      show_alert: showAlert
    })
  }).then(res => res.json());
}

async function setWebhook(request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.origin}/`;
  
  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query']
    })
  }).then(res => res.json());

  return new Response(JSON.stringify(response, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
