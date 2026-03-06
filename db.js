import { MongoClient } from "mongodb";
import "dotenv/config";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let chatsCollection;

export async function connectDB() {
    try {
        await client.connect();
        const db = client.db("tg_reaction_bot");
        chatsCollection = db.collection("chats");
        console.log("✅ Connected to MongoDB Atlas");
        return true;
    } catch (error) {
        console.error("❌ MongoDB connection error:", error.message);
        return false;
    }
}

export async function saveChatDB(chatId) {
    if (!chatsCollection) return;
    try {
        await chatsCollection.updateOne(
            { chatId: chatId },
            { $set: { chatId: chatId, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (error) {
        console.error("Error saving chat to DB:", error.message);
    }
}

export async function getAllChatsDB() {
    if (!chatsCollection) return [];
    try {
        const chats = await chatsCollection.find({}).toArray();
        return chats.map(c => c.chatId);
    } catch (error) {
        console.error("Error fetching chats from DB:", error.message);
        return [];
    }
}
