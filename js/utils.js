export const truncateChatHistory = (maxRecords, chatHistory) => {
    // Ensure there are more than maxRecords + 1 entries to require truncation
    if (chatHistory.length > maxRecords + 1) {
        // Keep the first entry (system message), up to maxRecords entries after the first, and the last entry
        const startIndex = Math.max(1, chatHistory.length - maxRecords - 1);
        // Return new array with first entry, and then the last maxRecords entries
        return [
            chatHistory[0],
            ...chatHistory.slice(startIndex, -1),
            chatHistory[chatHistory.length - 1],
        ];
    }
    return chatHistory;
}; 