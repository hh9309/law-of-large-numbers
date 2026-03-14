// geminiService.ts
import { GoogleGenAI } from "@google/genai";

export const getGeminiResponse = async (prompt: string, modelName: string = "gemini-2.0-flash-exp", customApiKey?: string) => {
  try {
    const apiKey = customApiKey || process.env.GEMINI_API_KEY || "";
    
    if (!apiKey) {
      return "未检测到 Gemini API Key。请在设置中配置您的 API Key 以激活 AI 导师功能。";
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "你是一位资深的数学教授，擅长用生动形象的语言解释概率论和大数定律。你的目标是帮助用户理解为什么随着试验次数增加，频率会趋于稳定。请保持专业且富有启发性。",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "抱歉，Gemini 模型响应出错，请检查 API Key 是否正确或稍后再试。";
  }
};

export const getDeepSeekResponse = async (prompt: string, customApiKey?: string) => {
  try {
    const apiKey = customApiKey || process.env.DEEPSEEK_API_KEY || "";
    
    if (!apiKey) {
      return "未检测到 DeepSeek API Key。请在设置中配置您的 API Key 以激活 AI 导师功能。";
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [
          {
            role: 'system',
            content: '你是一位资深的数学教授，擅长用生动形象的语言解释概率论和大数定律。你的目标是帮助用户理解为什么随着试验次数增加，频率会趋于稳定。请保持专业且富有启发性。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'DeepSeek API 请求失败');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("DeepSeek API Error:", error);
    return "抱歉，DeepSeek 模型响应出错，请检查 API Key 是否正确或稍后再试。";
  }
};