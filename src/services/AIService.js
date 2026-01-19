const { GoogleGenerativeAI } = require("@google/generative-ai");

class AIService {
    constructor() {
        this.client = null;
        this.model = null;
        this.history = []; // Conversation history for "Free Style"
        this.systemInstruction = `Bạn là trợ lý AI của ứng dụng SH Smart.

**KHẢ NĂNG CỦA BẠN:**
- **Chuyên gia Chứng khoán**: Bạn có kiến thức sâu rộng về thị trường, phân tích kỹ thuật, và xu hướng đầu tư. Hãy thoải mái trao đổi, thảo luận sâu về các mã cổ phiếu, chỉ số thị trường.
- **Hướng dẫn sử dụng App**: Chỉ hướng dẫn dựa trên "Sơ đồ chức năng" bên dưới.

**SƠ ĐỒ CHỨC NĂNG SH SMART (CHÍNH XÁC):**
1. **Bảng giá & Thị trường**: Xem giá, chỉ số thị trường.
2. **Menu Giao dịch**:
   - Giao dịch cơ sở (Đặt lệnh Mua/Bán)
   - Lệnh chờ khớp (Xem lệnh đang chờ)
   - Lịch sử lệnh (Tra cứu lệnh cũ)
   - Xác nhận lệnh
   - Thực hiện quyền
3. **Menu Tài sản**: Tổng quan tài sản, quản lý danh mục.
4. **Menu Quản lý tiền**:
   - Nộp tiền / Rút tiền
   - Ứng tiền (Ứng trước tiền bán)
   - Hoàn trả nợ vay
5. **Menu Báo cáo**:
   - Sao kê giao dịch
   - Chi tiết nợ vay
   - Lịch sử nộp/rút tiền, ứng tiền, chuyển tiền.
   - Lịch sử chuyển chứng khoán.
6. **Quản lý dịch vụ**: Đăng ký/Hủy các gói dịch vụ SHS.

**QUY TẮC PHẢN HỒI:**
- **Về kiến thức chứng khoán**: Hãy trả lời chi tiết, chuyên sâu, đưa ra nhận định khách quan.
- **Về tính năng SH Smart**: TUYỆT ĐỐI KHÔNG bịa đặt tính năng không có trong sơ đồ (như Tin tức, Cộng đồng...). Nếu không có, hãy báo là không tìm thấy.
- **Phong cách**: Chuyên nghiệp, khách quan, xưng "em" - "anh/chị".`;
    }

    init(apiKey) {
        if (!apiKey) return;
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            this.client = genAI;

            // User requested "gemini-3-flash-preview". 
            // We set it as requested.
            this.model = genAI.getGenerativeModel({
                model: "gemini-3-flash-preview",
            });
            // Backup model removed as per instruction.

        } catch (e) {
            console.error("AI Init Error:", e);
        }
    }

    // Dynamic re-init if key changes
    updateKey(newKey) {
        this.init(newKey);
    }

    async chatFreeStyle(userMessage) {
        // ... (keep checkConnection and chatFreeStyle as is, or updated similarly if needed, but focus on analyzeStock first)
        // Actually I need to keep the code structure valid.
        // I will only replace init and analyzeStock logic.
        // But since I can't skip lines easily without context...
        if (!this.model) return "Chưa cấu hình API Key. Vui lòng vào Cài đặt để nhập Key.";

        let retries = 0;
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000; // 2 seconds

        while (retries < MAX_RETRIES) {
            try {
                const recentHistory = this.history.slice(-10);
                const chat = this.model.startChat({
                    history: [
                        { role: "user", parts: [{ text: this.systemInstruction }] },
                        { role: "model", parts: [{ text: "Dạ, em đã hiểu. Em sẵn sàng hỗ trợ anh/chị ạ." }] },
                        ...recentHistory
                    ]
                });

                const result = await chat.sendMessage(userMessage);
                const response = result.response.text();

                this.history.push({ role: "user", parts: [{ text: userMessage }] });
                this.history.push({ role: "model", parts: [{ text: response }] });

                return response;
            } catch (e) {
                console.error("Chat Error:", e);
                if (e.message.includes("429") || e.status === 429 ||
                    e.message.includes("503") || e.status === 503) {

                    retries++;
                    if (retries < MAX_RETRIES) {
                        console.warn(`System busy (429/503). Retrying in ${RETRY_DELAY_MS / 1000}s... (Attempt ${retries}/${MAX_RETRIES})`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    } else {
                        return "⚠️ Hệ thống AI hiện đang quá tải (Google Gemini Server Busy). Vui lòng thử lại sau 30 giây.";
                    }
                } else {
                    return "Xin lỗi, em gặp chút trục trặc khi kết nối. (Lỗi: " + e.message + ")";
                }
            }
        }
        return "Lỗi kết nối: Không thể phản hồi sau nhiều lần thử lại.";
    }

    async checkConnection() {
        if (!this.model) return false;
        try {
            const result = await this.model.generateContent("Ping");
            await result.response;
            return true;
        } catch (e) {
            return false;
        }
    }

    async analyzeStock(symbol, marketData) {
        if (!this.model) return "Chưa cấu hình API Key.";

        const { price, change, percent, history, indicators, quote } = marketData;

        // ... (Keep summary logic essentially the same, abbreviating here for tool usage efficiency if I could, but I must provide full replacement content for the range)
        // I will just use the View output to reconstruct the prompt string part or verify.
        // To be safe, I'm replacing the whole method.

        let historySummary = "Không có dữ liệu lịch sử.";
        if (history && history.length > 0) {
            const last5 = history.slice(-5).map(h =>
                `- ${new Date(h.time * 1000).toLocaleDateString()}: Close ${h.close}, Vol ${h.volume}`
            ).join("\n");
            historySummary = `Dữ liệu 5 phiên gần nhất:\n${last5}`;
        }

        let taSummary = "Không có chỉ số kỹ thuật.";
        if (indicators) {
            if (Array.isArray(indicators)) {
                // condense the massive JSON into a readable list
                taSummary = indicators.map(item => {
                    const key = item.key || 'Unknown';
                    const val = item.value;
                    let desc = '';

                    if (typeof val === 'object' && val !== null) {
                        desc = val.point_Description || val.totalPoint || JSON.stringify(val);
                    } else {
                        desc = val;
                    }
                    return `- ${key}: ${desc}`;
                }).join("\n");
            } else {
                taSummary = JSON.stringify(indicators, null, 2);
            }
        }

        const prompt = `
Bạn là chuyên gia Phân tích kỹ thuật chứng khoán (Technical Analyst) lão luyện.
Hãy phân tích mã cổ phiếu ${symbol} dựa trên dữ liệu sau:

**1. Dữ liệu giá hiện tại:**
- Giá: ${price}
- Thay đổi: ${change} (${percent}%)
- Khối lượng: ${quote ? quote.totalVolume : 'N/A'}

**2. Các chỉ báo kỹ thuật (Technical Indicators):**
${taSummary}

**3. Lịch sử giá gần đây:**
${historySummary}

**Yêu cầu đầu ra:**
1. **Xu hướng hiện tại**: Ngắn hạn & Trung hạn (Tăng/Giảm/Đi ngang).
2. **Đánh giá các chỉ báo quan trọng**: RSI, MACD, MA... (Chỉ điểm ra những tín hiệu *đáng chú ý* nhất).
3. **Nhận định & Khuyến nghị**: MUA/BÁN/NẮM GIỮ, vùng giá hỗ trợ/kháng cự, cắt lỗ.

*Vui lòng trả lời ngắn gọn, súc tích, đi thẳng vào vấn đề.*
`;

        let retries = 0;
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000; // 2 seconds

        while (retries < MAX_RETRIES) {
            try {
                const chat = this.model.startChat({
                    history: [
                        { role: "user", parts: [{ text: this.systemInstruction }] },
                        { role: "model", parts: [{ text: "Ok, em đã sẵn sàng phân tích dữ liệu." }] }
                    ]
                });
                const result = await chat.sendMessage(prompt);
                const text = result.response.text();

                console.log("AI Response Length:", text ? text.length : 0);
                if (!text) {
                    throw new Error("AI returned empty response");
                }
                return text;
            } catch (e) {
                console.error("Analyze Error:", e);
                // Handle 429 (Rate Limit) and 503 (Service Unavailable - Overloaded)
                if (e.message.includes("429") || e.status === 429 ||
                    e.message.includes("503") || e.status === 503) {

                    retries++;
                    if (retries < MAX_RETRIES) {
                        console.warn(`System busy (429/503). Retrying in ${RETRY_DELAY_MS / 1000}s... (Attempt ${retries}/${MAX_RETRIES})`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    } else {
                        return "⚠️ Hệ thống AI hiện đang quá tải (Google Gemini Server Busy). Vui lòng thử lại sau 30 giây.";
                    }
                } else {
                    return "Lỗi phân tích: " + e.message;
                }
            }
        }
        return "Lỗi phân tích: Không thể kết nối tới Google Server sau nhiều lần thử.";

    }

    clearHistory() {
        this.history = [];
    }
}

module.exports = new AIService();
