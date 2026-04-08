import { Bot, InlineKeyboard, session } from "grammy";
import "dotenv/config";
import fs from "fs";
import http from "http";
import { connectDB, saveChatDB, getAllChatsDB } from "./db.js";

const bot = new Bot(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;
const CHATS_FILE = "./chats.json";

// Migration helper: Local JSON -> MongoDB
async function migrateToDB() {
    if (fs.existsSync(CHATS_FILE)) {
        try {
            const data = fs.readFileSync(CHATS_FILE, "utf-8");
            const chats = JSON.parse(data || "[]");
            console.log(`📦 Found ${chats.length} chats in local storage. Migrating...`);
            for (const id of chats) {
                await saveChatDB(id);
            }
            console.log("✅ Migration complete.");
            // Rename to avoid re-migration
            fs.renameSync(CHATS_FILE, `${CHATS_FILE}.bak`);
        } catch (error) {
            console.error("Migration error:", error.message);
        }
    }
}

// Simple session storage for language (in-memory)
bot.use(session({ initial: () => ({ lang: "en" }) }));

// Middleware to track all chats (Database version)
bot.use(async (ctx, next) => {
    if (ctx.chat) {
        await saveChatDB(ctx.chat.id);
    }
    return await next();
});

const strings = {
    en: {
        welcome: (name) => `👋 Hello ${name}\n\n🤖 I am an Auto Reaction Bot.\nI will automatically react to any message you send.\n\n∆ Made by: @sourav_sanyal 🥰\n\n✨ The bot is now fully active!`,
        help: "How to use me:\n1. Add me to your group or channel.\n2. Give me admin permissions.\n3. I will automatically react to new messages with 2 emojis!",
        about: "This bot was made with ❤️ by @sourav_sanyal.\nFor better bot or app development, please inbox me!",
        back: "⬅️ Back",
        help_btn: "❓ Help",
        about_btn: "ℹ️ About",
        add_group_btn: "➕ Add to Group",
        add_channel_btn: "📢 Add to Channel",
        lang_btn: "🌐 Language: English",
        select_lang: "Please select your language:"
    },
    bn: {
        welcome: (name) => `👋 হ্যালো ${name}\n\n🤖 আমি একটি অটো রিঅ্যাকশন বট।\nআপনি যেকোনো মেসেজ পাঠালেই আমি স্বয়ংক্রিয়ভাবে একটি রিঅ্যাকশন দিব।\n\n ∆আমাকে তৈরি করেছেন: @sourav_sanyal 🥰\n\n✨ বটটি এখন সম্পূর্ণ সক্রিয়!`,
        help: "কিভাবে আমাকে ব্যবহার করবেন:\n১. আমাকে আপনার গ্রুপ বা চ্যানেলে যোগ করুন।\n২. আমাকে অ্যাডমিন পারমিশন দিন।\n৩. আমি স্বয়ংক্রিয়ভাবে নতুন বার্তাগুলোতে ২ টি ইমোজি দিয়ে রিঅ্যাক্ট করবো!",
        about: "এই বটটি @sourav_sanyal দ্বারা ❤️ দিয়ে তৈরি করা হয়েছে।\nআরও উন্নত বট বা অ্যাপ তৈরির জন্য আমাকে ইনবক্স করুন!",
        back: "⬅️ ফিরে যান",
        help_btn: "❓ সাহায্য",
        about_btn: "ℹ️ সম্পর্কে জানুন",
        add_group_btn: "➕ গ্রুপে যোগ করুন",
        add_channel_btn: "📢 চ্যানেলে যোগ করুন",
        lang_btn: "🌐 ভাষা: বাংলা",
        select_lang: "অনুগ্রহ করে আপনার ভাষা নির্বাচন করুন:"
    }
};

const getMenu = (lang, user) => {
    const s = strings[lang];
    return new InlineKeyboard()
        .url(s.add_group_btn, `https://t.me/${user.username}?startgroup=true`)
        .url(s.add_channel_btn, `https://t.me/${user.username}?startchannel=true`).row()
        .text(s.help_btn, "help_action")
        .text(s.about_btn, "about_action").row()
        .text(s.lang_btn, "toggle_lang");
};

// /broadcast command (Admin only - Database version)
bot.command("broadcast", async (ctx) => {
    if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
        return;
    }

    const message = ctx.match;
    if (!message) {
        return await ctx.reply("Usage: /broadcast your message here");
    }

    try {
        const chats = await getAllChatsDB();

        // Remove admin's own ID from broadcast list
        const broadcastList = chats.filter(id => id.toString() !== (ctx.from?.id || "").toString());

        await ctx.reply(`🚀 Starting broadcast to ${broadcastList.length} chats from DB...`);

        let successCount = 0;
        let failCount = 0;

        for (const chatId of broadcastList) {
            try {
                await bot.api.sendMessage(chatId, message);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
                failCount++;
                console.error(`Failed to send broadcast to ${chatId}:`, err.message);
            }
        }

        await ctx.reply(`✅ Broadcast complete!\n\n📊 Stats:\n- Success: ${successCount}\n- Failed: ${failCount}\n- Total: ${broadcastList.length}`);
    } catch (error) {
        await ctx.reply(`❌ Broadcast failed: ${error.message}`);
    }
});

// /start command
bot.command("start", async (ctx) => {
    const name = `${ctx.from.first_name}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`;
    await ctx.reply(strings[ctx.session.lang].welcome(name), {
        reply_markup: getMenu(ctx.session.lang, ctx.me),
    });
});

// Toggle Language
bot.callbackQuery("toggle_lang", async (ctx) => {
    ctx.session.lang = ctx.session.lang === "en" ? "bn" : "en";
    await ctx.answerCallbackQuery();
    const name = `${ctx.from.first_name}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`;
    await ctx.editMessageText(strings[ctx.session.lang].welcome(name), {
        reply_markup: getMenu(ctx.session.lang, ctx.me),
    });
});

// Help Action
bot.callbackQuery("help_action", async (ctx) => {
    const s = strings[ctx.session.lang];
    const keyboard = new InlineKeyboard().text(s.back, "back_to_main");
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(s.help, { reply_markup: keyboard });
});

// About Action
bot.callbackQuery("about_action", async (ctx) => {
    const s = strings[ctx.session.lang];
    const keyboard = new InlineKeyboard().text(s.back, "back_to_main");
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(s.about, { reply_markup: keyboard });
});

// Back to Main Menu
bot.callbackQuery("back_to_main", async (ctx) => {
    await ctx.answerCallbackQuery();
    const name = `${ctx.from.first_name}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`;
    await ctx.editMessageText(strings[ctx.session.lang].welcome(name), {
        reply_markup: getMenu(ctx.session.lang, ctx.me),
    });
});

// Catch-all to see any updates
bot.use(async (ctx, next) => {
    const updateType = Object.keys(ctx.update).filter(k => k !== "update_id")[0];
    console.log(`Update ${ctx.update.update_id} received: ${updateType}`);
    if (ctx.chat) console.log(`Chat ID: ${ctx.chat.id}, Type: ${ctx.chat.type}`);
    return await next();
});

// Log when added to chat
bot.on("my_chat_member", (ctx) => {
    console.log(`Bot status in ${ctx.chat.id} changed to: ${ctx.myChatMember.new_chat_member.status}`);
});

// Reaction logic (Group and Channel)
bot.on(["message", "channel_post"], async (ctx) => {
    // Basic chat type check
    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup" && ctx.chat.type !== "channel") {
        return;
    }

    // Skip service messages (like pinned messages, user joins, etc.) which don't support reactions
    if (ctx.msg?.service || ctx.message?.service || ctx.channelPost?.service) {
        return;
    }

    try {
        // Standard emojis that are usually enabled in all chats
        const reactions = ["👍", "❤️", "🔥", "😂", "😮", "😢"];
        const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
        
        await ctx.react(randomReaction);
        console.log(`✅ Reacted with ${randomReaction} in ${ctx.chat.type} (${ctx.chat.id})`);
    } catch (error) {
        const errorMsg = error.message || "";
        const description = error.description || "";

        if (description.includes("admin") || errorMsg.includes("admin")) {
            console.error(`⚠️ Permission problem in ${ctx.chat.id}: Bot needs 'Post' and 'Edit' admin rights.`);
        } else if (description.includes("REACTION_INVALID") || errorMsg.includes("REACTION_INVALID")) {
            console.error(`❌ Reaction not allowed/custom emojis only in ${ctx.chat.id}`);
        } else if (description.includes("BOT_METHOD_INVALID") || errorMsg.includes("BOT_METHOD_INVALID")) {
            console.error(`❌ BOT_METHOD_INVALID in ${ctx.chat.id}: This usually means the bot is not an admin with 'Post Messages' permission in this channel.`);
        } else {
            console.error(`❌ Error in ${ctx.chat.id}: ${errorMsg} - ${description}`);
        }
    }
});

// Start the bot
const startBot = async () => {
    // Basic HTTP server for Render health check
    const PORT = process.env.PORT || 10000;
    http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Bot is running!\n");
    }).listen(PORT, "0.0.0.0", () => {
        console.log(`Server is listening on port ${PORT}`);
    });

    const connected = await connectDB();
    if (!connected) return;

    await migrateToDB();

    bot.start({
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post", "callback_query", "my_chat_member"],
        onStart: async (me) => {
            console.log(`Bot @${me.username} is active and ready! 🚀`);
            try {
                await bot.api.deleteWebhook({ drop_pending_updates: true });
                console.log("✅ Webhook cleared.");
            } catch (e) {
                console.error("Failed to clear webhook:", e.message);
            }
        }
    });
};

startBot();
