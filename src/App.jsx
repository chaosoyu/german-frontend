import { useState, useEffect, useRef, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// 🌟 自動判斷連線網址：在雲端會讀取 Vercel 設定的網址，在自己電腦則連回 127.0.0.1:8000
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// 陣列洗牌函數 (Fisher-Yates Shuffle)
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// 將德文句子拆解為「單字」與「獨立標點符號」字卡
const tokenizeSentenceWithPunctuation = (sentenceStr) => {
  if (!sentenceStr) return [];
  const matches = sentenceStr.match(/[a-zA-ZäöüßÄÖÜ0-9]+|[.,!?;:]/g);
  return matches ? matches : sentenceStr.split(/\s+/);
};

function App() {
  // --- 視圖與權限狀態 ---
  const [currentView, setCurrentView] = useState("quiz"); // "quiz" | "admin"
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const ADMIN_PASSWORD = "1234";

  // --- 測驗分頁切換狀態 ("nouns" | "verbs" | "sentences") ---
  const [activeQuizTab, setActiveQuizTab] = useState("nouns");

  const [inputText, setInputText] = useState("");
  const [quizData, setQuizData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWeaknessMode, setIsWeaknessMode] = useState(false);

  // 儲存隨機打亂後的題目 ID 順序 (避免背景更新統計時題目順序跳動)
  const [shuffledIds, setShuffledIds] = useState({ nouns: [], verbs: [], sentences: [] });

  const fileInputRef = useRef(null);
  const fileUploadRef = useRef(null);

  // --- 學習進度統計計算 ---
  const stats = useMemo(() => {
    if (!quizData) return { total: 0, mastered: 0, weak: 0, new: 0 };
    const allItems = [...(quizData.nouns || []), ...(quizData.verbs || []), ...(quizData.sentences || [])];
    let mastered = 0, weak = 0, newItem = 0;

    allItems.forEach(item => {
      if (item.correct_count === 0 && item.wrong_count === 0) newItem++;
      else if (item.correct_count > item.wrong_count) mastered++;
      else weak++;
    });
    return { total: allItems.length, mastered, weak, new: newItem };
  }, [quizData]);

  const chartData = [
    { name: '全新題', value: stats.new, color: '#2196f3' },
    { name: '已掌握', value: stats.mastered, color: '#4caf50' },
    { name: '待加強', value: stats.weak, color: '#f44336' }
  ];

  // 當題庫總數改變或切換「弱點模式」時，重新洗牌題目順序
  const totalCount = (quizData?.nouns?.length || 0) + (quizData?.verbs?.length || 0) + (quizData?.sentences?.length || 0);
  useEffect(() => {
    if (!quizData) return;
    const filterFn = (item) => isWeaknessMode ? (item.wrong_count >= item.correct_count && item.wrong_count > 0) : true;
    
    setShuffledIds({
      nouns: shuffleArray(quizData.nouns.filter(filterFn).map(n => n.id)),
      verbs: shuffleArray(quizData.verbs.filter(filterFn).map(v => v.id)),
      sentences: shuffleArray(quizData.sentences.filter(filterFn).map(s => s.id))
    });
    setCurrentNounIndex(0);
    setCurrentVerbIndex(0);
    setCurrentSentenceIndex(0);
  }, [totalCount, isWeaknessMode]);

  // 依據洗牌後的 ID 取出對應題目
  const displayedNouns = useMemo(() => {
    if (!quizData?.nouns) return [];
    const map = new Map(quizData.nouns.map(n => [n.id, n]));
    return shuffledIds.nouns.map(id => map.get(id)).filter(Boolean);
  }, [quizData, shuffledIds.nouns]);

  const displayedVerbs = useMemo(() => {
    if (!quizData?.verbs) return [];
    const map = new Map(quizData.verbs.map(v => [v.id, v]));
    return shuffledIds.verbs.map(id => map.get(id)).filter(Boolean);
  }, [quizData, shuffledIds.verbs]);

  const displayedSentences = useMemo(() => {
    if (!quizData?.sentences) return [];
    const map = new Map(quizData.sentences.map(s => [s.id, s]));
    return shuffledIds.sentences.map(id => map.get(id)).filter(Boolean);
  }, [quizData, shuffledIds.sentences]);

  // --- 模組一：名詞狀態 ---
  const [currentNounIndex, setCurrentNounIndex] = useState(0);
  const [userGender, setUserGender] = useState("");
  const [userWord, setUserWord] = useState("");
  const [nounFeedback, setNounFeedback] = useState(null);
  const [nounCanProceed, setNounCanProceed] = useState(false);

  // --- 模組二：動詞狀態 ---
  const [currentVerbIndex, setCurrentVerbIndex] = useState(0);
  const defaultVerbAnswers = { ich: "", du: "", er_sie_es: "", wir: "", ihr: "", sie_Sie: "" };
  const [verbAnswers, setVerbAnswers] = useState(defaultVerbAnswers);
  const [verbFeedback, setVerbFeedback] = useState(null);
  const [verbCanProceed, setVerbCanProceed] = useState(false);

  // 動詞雙欄對應順序：左欄 (我、你、他) | 右欄 (我們、你們、他們)
  const verbGridOrder = [
    { key: "ich", label: "我 (ich)" },
    { key: "wir", label: "我們 (wir)" },
    { key: "du", label: "你 (du)" },
    { key: "ihr", label: "你們 (ihr)" },
    { key: "er_sie_es", label: "他 (er/sie/es)" },
    { key: "sie_Sie", label: "他們 (sie/Sie)" }
  ];

  // --- 模組三：句子狀態 ---
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [sentenceWords, setSentenceWords] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [sentenceFeedback, setSentenceFeedback] = useState(null);
  const [sentenceCanProceed, setSentenceCanProceed] = useState(false);

  useEffect(() => { fetchQuizzesFromDB(); }, []);

  // 僅在「當前句子 ID」改變時才打散字卡（包含標點符號），驗證後絕不重新打散
  const currentSentenceId = displayedSentences[currentSentenceIndex]?.id;
  useEffect(() => {
    const currentSentence = displayedSentences[currentSentenceIndex];
    if (currentSentence) {
      const tokens = tokenizeSentenceWithPunctuation(currentSentence.german);
      setSentenceWords(shuffleArray(tokens));
      setSentenceFeedback(null);
      setSentenceCanProceed(false);
    }
  }, [currentSentenceId]);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdminUnlocked(true);
      setPasswordInput("");
    } else {
      alert("❌ 密碼錯誤，無法進入後台！");
      setPasswordInput("");
    }
  };

  // 🌟 以下 6 處 API 請求皆已改用 API_BASE_URL
  const fetchQuizzesFromDB = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quizzes`);
      setQuizData(await response.json());
    } catch (error) { console.error("資料庫連線失敗"); }
  };

  const clearDatabase = async () => {
    if (!window.confirm("確定清空所有題庫與學習紀錄？")) return;
    await fetch(`${API_BASE_URL}/api/quizzes`, { method: "DELETE" });
    setQuizData(null);
    alert("🗑️ 已清空");
  };

  const importQuiz = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        await fetch(`${API_BASE_URL}/api/import-db`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(importedData),
        });
        await fetchQuizzesFromDB();
        alert("🎉 舊 JSON 題庫已成功匯入新系統！");
      } catch (error) { alert("❌ 匯入失敗：檔案格式錯誤。"); }
    };
    reader.readAsText(file);
    event.target.value = null;
  };

  const exportQuiz = () => {
    if (!quizData) return;
    const jsonString = JSON.stringify(quizData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "德語總題庫_含數據.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const uploadAndGenerateQuiz = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData(); formData.append("file", file);
    await fetch(`${API_BASE_URL}/api/upload-file`, { method: "POST", body: formData });
    await fetchQuizzesFromDB();
    setIsLoading(false);
    event.target.value = null;
    alert("🎉 檔案辨識成功並已去重寫入資料庫！");
  };

  const generateTextQuiz = async () => {
    if (!inputText.trim()) return alert("請輸入德文內容");
    setIsLoading(true);
    await fetch(`${API_BASE_URL}/api/generate-quiz`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: inputText }),
    });
    await fetchQuizzesFromDB();
    setIsLoading(false);
    setInputText("");
    alert("✅ 文字題庫已加入資料庫！");
  };

  // 語音播放防呆：正在播放時重複點擊不會重複觸發
  const playAudio = (text) => {
    if (!text) return;
    if (window.speechSynthesis.speaking) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
  };

  const recordResult = async (type, item_id, is_correct) => {
    await fetch(`${API_BASE_URL}/api/record-result`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, item_id, is_correct })
    });
    fetchQuizzesFromDB();
  };

  // =========================================================
  // 模組一：名詞驗證、揭曉答案、下一題與略過
  // =========================================================
  const checkNounAnswer = async () => {
    const currentNoun = displayedNouns[currentNounIndex];
    const expectedWord = currentNoun.word.charAt(0).toUpperCase() + currentNoun.word.slice(1);
    const trimmedInput = userWord.trim();

    if (!userGender || !trimmedInput) {
      setNounFeedback({ type: 'error', text: '⚠️ 請選擇定冠詞並輸入單字！' });
      return;
    }

    const isFirstLetterUpper = trimmedInput[0] === trimmedInput[0].toUpperCase() && trimmedInput[0] !== trimmedInput[0].toLowerCase();
    const isCorrect = (userGender === currentNoun.gender && trimmedInput === expectedWord);

    if (isCorrect) {
      setNounFeedback({ type: 'success', text: `🎉 答對了！ ${currentNoun.gender} ${expectedWord} (複數: ${currentNoun.plural})` });
      setNounCanProceed(true);
    } else if (!isFirstLetterUpper) {
      setNounFeedback({ type: 'error', text: '❌ 答錯了！注意：德文名詞「開頭字母必須大寫」，請修正後再試一次，或點擊揭曉答案。' });
    } else {
      setNounFeedback({ type: 'error', text: '❌ 答錯了！請再試一次，或點擊「揭曉答案」。' });
    }
    await recordResult("noun", currentNoun.id, isCorrect);
  };

  const revealNounAnswer = () => {
    const currentNoun = displayedNouns[currentNounIndex];
    const expectedWord = currentNoun.word.charAt(0).toUpperCase() + currentNoun.word.slice(1);
    setNounFeedback({ type: 'info', text: `💡 正確解答：${currentNoun.gender} ${expectedWord} (複數: ${currentNoun.plural})` });
    setNounCanProceed(true);
  };

  const goToNextNoun = () => {
    setUserGender(""); setUserWord(""); setNounFeedback(null); setNounCanProceed(false);
    if (currentNounIndex + 1 < displayedNouns.length) setCurrentNounIndex(currentNounIndex + 1);
    else setCurrentNounIndex(0);
  };

  // =========================================================
  // 模組二：動詞驗證、揭曉答案、下一題與略過
  // =========================================================
  const getExpectedVerbForm = (praesensObj, key) => {
    if (!praesensObj) return "";
    return praesensObj[key] || praesensObj[key.replace("_sie_es", "")] || praesensObj[key.replace(/_/g, "/")] || praesensObj[key.replace(/_/g, " ")] || "";
  };

  const checkVerbAnswer = async () => {
    const currentVerb = displayedVerbs[currentVerbIndex];
    let allCorrect = true;
    Object.keys(defaultVerbAnswers).forEach(key => {
      const expected = getExpectedVerbForm(currentVerb.praesens, key);
      if (String(verbAnswers[key]).trim().toLowerCase() !== String(expected).trim().toLowerCase()) {
        allCorrect = false;
      }
    });

    if (allCorrect) {
      setVerbFeedback({ type: 'success', text: '🎉 完全正確！六大人稱變化全數過關！' });
      setVerbCanProceed(true);
    } else {
      setVerbFeedback({ type: 'error', text: '❌ 動詞變化有誤！請檢查拼字後再試一次，或點擊「揭曉答案」。' });
    }
    await recordResult("verb", currentVerb.id, allCorrect);
  };

  const revealVerbAnswer = () => {
    const currentVerb = displayedVerbs[currentVerbIndex];
    const details = verbGridOrder.map(item => `${item.label}: ${getExpectedVerbForm(currentVerb.praesens, item.key)}`).join(" ｜ ");
    setVerbFeedback({ type: 'info', text: `💡 正確解答：${details}` });
    setVerbCanProceed(true);
  };

  const goToNextVerb = () => {
    setVerbAnswers(defaultVerbAnswers); setVerbFeedback(null); setVerbCanProceed(false);
    if (currentVerbIndex + 1 < displayedVerbs.length) setCurrentVerbIndex(currentVerbIndex + 1);
    else setCurrentVerbIndex(0);
  };

  // =========================================================
  // 模組三：句子重組驗證、揭曉答案、下一句與略過
  // =========================================================
  const handleDragStart = (index) => setDraggedIdx(index);
  const handleDragEnter = (index) => {
    if (draggedIdx === null || draggedIdx === index) return;
    const newWords = [...sentenceWords];
    const draggedWord = newWords[draggedIdx];
    newWords.splice(draggedIdx, 1);
    newWords.splice(index, 0, draggedWord);
    setDraggedIdx(index);
    setSentenceWords(newWords);
  };
  const handleDragEnd = () => setDraggedIdx(null);

  const checkSentenceAnswer = async () => {
    const currentSentence = displayedSentences[currentSentenceIndex];
    const expectedTokens = tokenizeSentenceWithPunctuation(currentSentence.german);
    const isCorrect = sentenceWords.join(" ") === expectedTokens.join(" ");

    if (isCorrect) {
      setSentenceFeedback({ type: 'success', text: '🎉 句型與標點符號順序完全正確！' });
      setSentenceCanProceed(true);
    } else {
      setSentenceFeedback({ type: 'error', text: '❌ 語序或標點符號位置有誤！請直接調整上方字卡再試一次，或點擊「揭曉答案」。' });
    }
    await recordResult("sentence", currentSentence.id, isCorrect);
  };

  const revealSentenceAnswer = () => {
    const currentSentence = displayedSentences[currentSentenceIndex];
    setSentenceFeedback({ type: 'info', text: `💡 正確解答：${currentSentence.german}` });
    setSentenceCanProceed(true);
  };

  const goToNextSentence = () => {
    setSentenceFeedback(null); setSentenceCanProceed(false);
    if (currentSentenceIndex + 1 < displayedSentences.length) setCurrentSentenceIndex(currentSentenceIndex + 1);
    else setCurrentSentenceIndex(0);
  };

  const getFeedbackStyle = (type) => {
    if (type === 'success') return { bg: '#e8f5e9', color: '#2e7d32' };
    if (type === 'info') return { bg: '#e3f2fd', color: '#0d47a1' };
    return { bg: '#ffebee', color: '#c62828' };
  };

  return (
    <div style={{ padding: "20px", maxWidth: "850px", margin: "0 auto", fontFamily: "sans-serif", backgroundColor: "#f4f7f6", minHeight: "100vh", boxSizing: "border-box" }}>
      
      {/* 頂部主導覽列 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px", padding: "12px 20px", backgroundColor: "#fff", borderRadius: "10px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: 0, fontSize: "20px", color: "#005b9f" }}>🇩🇪 德語智能學習系統</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            onClick={() => setCurrentView("quiz")} 
            style={{ padding: "8px 20px", fontSize: "15px", fontWeight: "bold", border: "none", borderRadius: "6px", cursor: "pointer", backgroundColor: currentView === "quiz" ? "#005b9f" : "#eee", color: currentView === "quiz" ? "white" : "#555" }}>
            👨‍🎓 學生測驗專區
          </button>
          <button 
            onClick={() => setCurrentView("admin")} 
            style={{ padding: "8px 20px", fontSize: "15px", fontWeight: "bold", border: "none", borderRadius: "6px", cursor: "pointer", backgroundColor: currentView === "admin" ? "#d84315" : "#eee", color: currentView === "admin" ? "white" : "#555" }}>
            ⚙️ 題庫管理後台
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 視圖一：後台題庫管理介面 (含密碼鎖) */}
      {/* ========================================================= */}
      {currentView === "admin" && (
        <div style={{ background: "#fff", padding: "30px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
          {!isAdminUnlocked ? (
            <form onSubmit={handleAdminLogin} style={{ maxWidth: "360px", margin: "40px auto", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "10px" }}>🔒</div>
              <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>管理員權限驗證</h3>
              <p style={{ color: "#777", fontSize: "14px", marginBottom: "20px" }}>請輸入管理員密碼以維護或擴充題庫</p>
              <input 
                type="password" 
                value={passwordInput} 
                onChange={(e) => setPasswordInput(e.target.value)} 
                placeholder="請輸入密碼 (預設: 1234)" 
                style={{ width: "100%", padding: "12px", fontSize: "16px", borderRadius: "6px", border: "1px solid #ccc", marginBottom: "15px", boxSizing: "border-box", textAlign: "center" }}
                autoFocus
              />
              <button type="submit" style={{ width: "100%", padding: "12px", backgroundColor: "#d84315", color: "white", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer" }}>
                解鎖進入後台
              </button>
            </form>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #eee", paddingBottom: "12px", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: "#d84315" }}>🛠️ 資料庫維護與匯出入</h3>
                <button onClick={() => { setIsAdminUnlocked(false); setCurrentView("quiz"); }} style={{ padding: "6px 14px", backgroundColor: "#555", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "13px" }}>
                  🔒 鎖定並離開後台
                </button>
              </div>
              
              <div style={{ display: "flex", gap: "10px", marginBottom: "30px", flexWrap: "wrap" }}>
                <input type="file" accept=".json" ref={fileInputRef} style={{ display: "none" }} onChange={importQuiz} />
                <button onClick={() => fileInputRef.current.click()} style={{ padding: "10px 18px", backgroundColor: "#f0f0f0", border: "1px solid #ccc", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
                  📂 匯入 JSON 恢復題庫
                </button>
                
                <button onClick={exportQuiz} disabled={!quizData || stats.total === 0} style={{ padding: "10px 18px", backgroundColor: "#e3f2fd", color: "#005b9f", border: "1px solid #90caf9", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", opacity: (!quizData || stats.total === 0) ? 0.5 : 1 }}>
                  💾 備份總資料庫 (含數據)
                </button>

                <button onClick={clearDatabase} style={{ padding: "10px 18px", backgroundColor: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", marginLeft: "auto" }}>
                  🗑️ 清空所有資料
                </button>
              </div>

              <h3 style={{ color: "#333", borderBottom: "2px solid #eee", paddingBottom: "10px" }}>🤖 AI 智慧擴充題庫</h3>
              <textarea rows="4" style={{ width: "100%", padding: "12px", fontSize: "15px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid #ccc", marginBottom: "15px" }} value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="貼上德文文章，AI 將自動萃取單字、動詞與句子..." />
              
              <div style={{ display: "flex", gap: "15px" }}>
                <button onClick={generateTextQuiz} disabled={isLoading} style={{ flex: 1, padding: "14px", backgroundColor: "#005b9f", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "16px", fontWeight: "bold" }}>
                  {isLoading ? "處理中..." : "📝 純文字解析並擴充"}
                </button>

                <input type="file" accept="image/jpeg, image/png, application/pdf" ref={fileUploadRef} style={{ display: "none" }} onChange={uploadAndGenerateQuiz} />
                <button onClick={() => fileUploadRef.current.click()} disabled={isLoading} style={{ flex: 1, padding: "14px", backgroundColor: "#d84315", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "16px", fontWeight: "bold" }}>
                  {isLoading ? "AI 視覺辨識中..." : "📸 上傳 PDF / 圖片擴充"}
                </button>
              </div>

              <div style={{ marginTop: "25px", padding: "12px", backgroundColor: "#e8f5e9", borderRadius: "8px", color: "#2e7d32", fontWeight: "bold", textAlign: "center" }}>
                📊 目前系統總收錄：{quizData?.nouns?.length || 0} 個名詞 / {quizData?.verbs?.length || 0} 個動詞 / {quizData?.sentences?.length || 0} 個句子
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 視圖二：前台學生測驗介面 */}
      {/* ========================================================= */}
      {currentView === "quiz" && (
        <>
          {quizData && stats.total > 0 ? (
            <>
              {/* 學習儀表板 */}
              <div style={{ background: "#fff", padding: "20px", borderRadius: "10px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "25px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)", flexWrap: "wrap", boxSizing: "border-box" }}>
                <div style={{ width: "160px", height: "160px", flexShrink: 0, margin: "0 auto" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2}>
                        {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} 題`, '數量']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ flex: 1, minWidth: "280px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "15px" }}>
                    <div style={{ backgroundColor: "#f8f9fa", padding: "10px", borderRadius: "8px", textAlign: "center", borderTop: "3px solid #6c757d" }}>
                      <div style={{ fontSize: "13px", color: "#666", marginBottom: "4px" }}>累積題庫</div>
                      <div style={{ fontSize: "20px", fontWeight: "bold", color: "#333" }}>{stats.total}</div>
                    </div>
                    <div style={{ backgroundColor: "#e3f2fd", padding: "10px", borderRadius: "8px", textAlign: "center", borderTop: "3px solid #2196f3" }}>
                      <div style={{ fontSize: "13px", color: "#1565c0", marginBottom: "4px" }}>🔵 全新題</div>
                      <div style={{ fontSize: "20px", fontWeight: "bold", color: "#1565c0" }}>{stats.new}</div>
                    </div>
                    <div style={{ backgroundColor: "#e8f5e9", padding: "10px", borderRadius: "8px", textAlign: "center", borderTop: "3px solid #4caf50" }}>
                      <div style={{ fontSize: "13px", color: "#2e7d32", marginBottom: "4px" }}>🟢 已掌握</div>
                      <div style={{ fontSize: "20px", fontWeight: "bold", color: "#2e7d32" }}>{stats.mastered}</div>
                    </div>
                    <div style={{ backgroundColor: "#ffebee", padding: "10px", borderRadius: "8px", textAlign: "center", borderTop: "3px solid #f44336" }}>
                      <div style={{ fontSize: "13px", color: "#c62828", marginBottom: "4px" }}>🔴 待加強</div>
                      <div style={{ fontSize: "20px", fontWeight: "bold", color: "#c62828" }}>{stats.weak}</div>
                    </div>
                  </div>

                  <div style={{ padding: "10px 15px", backgroundColor: isWeaknessMode ? "#ffebee" : "#f5f5f5", borderRadius: "6px", border: isWeaknessMode ? "1px solid #f44336" : "1px solid #ddd" }}>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontWeight: "bold", fontSize: "14px", color: isWeaknessMode ? "#d32f2f" : "#333" }}>
                      <input type="checkbox" checked={isWeaknessMode} onChange={(e) => setIsWeaknessMode(e.target.checked)} style={{ transform: "scale(1.3)", marginRight: "10px" }} />
                      🎯 啟動「弱點特訓模式」（僅隨機抽考紅色待加強題目）
                    </label>
                  </div>
                </div>
              </div>

              {/* 三大題型分頁切換按鈕 */}
              <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                <button 
                  onClick={() => setActiveQuizTab("nouns")}
                  style={{ flex: 1, padding: "14px", fontSize: "16px", fontWeight: "bold", borderRadius: "8px", cursor: "pointer", border: activeQuizTab === "nouns" ? "2px solid #2e7d32" : "1px solid #ddd", backgroundColor: activeQuizTab === "nouns" ? "#e8f5e9" : "#fff", color: activeQuizTab === "nouns" ? "#2e7d32" : "#555" }}>
                  🎧 名詞聽寫 ({displayedNouns.length})
                </button>
                <button 
                  onClick={() => setActiveQuizTab("verbs")}
                  style={{ flex: 1, padding: "14px", fontSize: "16px", fontWeight: "bold", borderRadius: "8px", cursor: "pointer", border: activeQuizTab === "verbs" ? "2px solid #ed6c02" : "1px solid #ddd", backgroundColor: activeQuizTab === "verbs" ? "#fff3e0" : "#fff", color: activeQuizTab === "verbs" ? "#ed6c02" : "#555" }}>
                  ✍️ 動詞變化 ({displayedVerbs.length})
                </button>
                <button 
                  onClick={() => setActiveQuizTab("sentences")}
                  style={{ flex: 1, padding: "14px", fontSize: "16px", fontWeight: "bold", borderRadius: "8px", cursor: "pointer", border: activeQuizTab === "sentences" ? "2px solid #9c27b0" : "1px solid #ddd", backgroundColor: activeQuizTab === "sentences" ? "#f3e5f5" : "#fff", color: activeQuizTab === "sentences" ? "#9c27b0" : "#555" }}>
                  🧩 句型重組 ({displayedSentences.length})
                </button>
              </div>

              {/* ---------------- 分頁一：名詞測驗 ---------------- */}
              {activeQuizTab === "nouns" && (
                <div style={{ background: "#fff", padding: "30px", borderRadius: "10px", borderTop: "5px solid #2e7d32", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, color: "#2e7d32" }}>🎧 名詞性別與聽寫測驗 (隨機出題)</h3>
                    <span style={{ fontWeight: "bold", color: "#666" }}>進度：{displayedNouns.length > 0 ? currentNounIndex + 1 : 0} / {displayedNouns.length}</span>
                  </div>
                  {displayedNouns.length === 0 ? <p style={{ color: "#777", textAlign: "center", padding: "30px" }}>目前模式下沒有需要練習的名詞題目</p> : (
                    <>
                      <div style={{ backgroundColor: "#f1f8e9", padding: "15px 20px", borderRadius: "8px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: "14px", color: "#555" }}>中文意思：</span>
                          <div style={{ fontSize: "22px", fontWeight: "bold", color: "#1b5e20", marginTop: "4px" }}>{displayedNouns[currentNounIndex]?.translation}</div>
                        </div>
                        <button onClick={() => playAudio(displayedNouns[currentNounIndex]?.word)} style={{ padding: "10px 18px", cursor: "pointer", borderRadius: "6px", border: "none", backgroundColor: "#2e7d32", color: "white", fontWeight: "bold", fontSize: "15px" }}>
                          🔊 播放德語發音
                        </button>
                      </div>

                      <div style={{ marginBottom: "20px" }}>
                        <div style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>1. 選擇定冠詞 (詞性)：</div>
                        <div style={{ display: "flex", gap: "12px" }}>
                          {['der', 'die', 'das'].map(g => (
                            <button key={g} onClick={() => setUserGender(g)} style={{ flex: 1, padding: "12px", backgroundColor: userGender === g ? "#2e7d32" : "#f0f0f0", color: userGender === g ? "#fff" : "#333", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "18px", cursor: "pointer" }}>
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: "20px" }}>
                        <div style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>2. 拼出德文名詞（⚠️ 開頭必須大寫，小寫視為錯誤）：</div>
                        <input type="text" value={userWord} onChange={(e) => setUserWord(e.target.value)} placeholder="請輸入聽到的單字..." style={{ width: "100%", padding: "14px", boxSizing: "border-box", borderRadius: "6px", border: "1px solid #ccc", fontSize: "18px" }} />
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button onClick={checkNounAnswer} style={{ flex: 2, padding: "14px", backgroundColor: "#ed6c02", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>✨ 驗證答案</button>
                        <button onClick={revealNounAnswer} style={{ flex: 1, padding: "14px", backgroundColor: "#0288d1", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>💡 揭曉答案</button>
                        <button onClick={goToNextNoun} disabled={!nounCanProceed} style={{ flex: 1, padding: "14px", backgroundColor: nounCanProceed ? "#2e7d32" : "#ccc", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: nounCanProceed ? "pointer" : "not-allowed" }}>➡️ 下一題</button>
                        <button onClick={goToNextNoun} style={{ flex: 1, padding: "14px", backgroundColor: "#757575", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>⏭️ 略過</button>
                      </div>
                      {nounFeedback && (
                        <div style={{ marginTop: "20px", padding: "15px", borderRadius: "6px", backgroundColor: getFeedbackStyle(nounFeedback.type).bg, color: getFeedbackStyle(nounFeedback.type).color, fontWeight: "bold", fontSize: "16px" }}>
                          {nounFeedback.text}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ---------------- 分頁二：動詞測驗 ---------------- */}
              {activeQuizTab === "verbs" && (
                <div style={{ background: "#fff", padding: "30px", borderRadius: "10px", borderTop: "5px solid #ed6c02", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, color: "#ed6c02" }}>✍️ 動詞現在式變化填空 (隨機出題)</h3>
                    <span style={{ fontWeight: "bold", color: "#666" }}>進度：{displayedVerbs.length > 0 ? currentVerbIndex + 1 : 0} / {displayedVerbs.length}</span>
                  </div>
                  {displayedVerbs.length === 0 ? <p style={{ color: "#777", textAlign: "center", padding: "30px" }}>目前模式下沒有需要練習的動詞題目</p> : (
                    <>
                      <div style={{ backgroundColor: "#fff3e0", padding: "15px 20px", borderRadius: "8px", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: "26px", fontWeight: "bold", color: "#e65100", marginRight: "12px" }}>{displayedVerbs[currentVerbIndex]?.infinitive}</span>
                          <span style={{ fontSize: "18px", color: "#666" }}>({displayedVerbs[currentVerbIndex]?.translation})</span>
                        </div>
                        <button onClick={() => playAudio(displayedVerbs[currentVerbIndex]?.infinitive)} style={{ padding: "8px 15px", cursor: "pointer", borderRadius: "6px", border: "none", backgroundColor: "#ed6c02", color: "white", fontWeight: "bold" }}>
                          🔊 發音
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "25px" }}>
                        {verbGridOrder.map(({ key, label }) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", backgroundColor: "#fafafa", padding: "10px 15px", borderRadius: "6px", border: "1px solid #eee" }}>
                            <span style={{ width: "125px", fontSize: "15px", fontWeight: "bold", color: "#444" }}>{label}</span>
                            <input type="text" value={verbAnswers[key]} onChange={(e) => setVerbAnswers({ ...verbAnswers, [key]: e.target.value })} style={{ flex: 1, padding: "10px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "16px" }} />
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button onClick={checkVerbAnswer} style={{ flex: 2, padding: "14px", backgroundColor: "#ed6c02", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>✨ 驗證全表</button>
                        <button onClick={revealVerbAnswer} style={{ flex: 1, padding: "14px", backgroundColor: "#0288d1", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>💡 揭曉答案</button>
                        <button onClick={goToNextVerb} disabled={!verbCanProceed} style={{ flex: 1, padding: "14px", backgroundColor: verbCanProceed ? "#2e7d32" : "#ccc", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: verbCanProceed ? "pointer" : "not-allowed" }}>➡️ 下一題</button>
                        <button onClick={goToNextVerb} style={{ flex: 1, padding: "14px", backgroundColor: "#757575", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>⏭️ 略過</button>
                      </div>
                      {verbFeedback && (
                        <div style={{ marginTop: "20px", padding: "15px", borderRadius: "6px", backgroundColor: getFeedbackStyle(verbFeedback.type).bg, color: getFeedbackStyle(verbFeedback.type).color, fontWeight: "bold", fontSize: "15px", lineHeight: "1.6" }}>
                          {verbFeedback.text}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ---------------- 分頁三：句子重組 ---------------- */}
              {activeQuizTab === "sentences" && (
                <div style={{ background: "#fff", padding: "30px", borderRadius: "10px", borderTop: "5px solid #9c27b0", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, color: "#9c27b0" }}>🧩 句型語序拖曳重組 (含標點符號)</h3>
                    <span style={{ fontWeight: "bold", color: "#666" }}>進度：{displayedSentences.length > 0 ? currentSentenceIndex + 1 : 0} / {displayedSentences.length}</span>
                  </div>
                  {displayedSentences.length === 0 ? <p style={{ color: "#777", textAlign: "center", padding: "30px" }}>目前模式下沒有需要練習的句子題目</p> : (
                    <>
                      <div style={{ backgroundColor: "#f3e5f5", padding: "15px 20px", borderRadius: "8px", marginBottom: "20px" }}>
                        <span style={{ fontSize: "13px", color: "#6a1b9a", backgroundColor: "#e1bee7", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                          句型：{displayedSentences[currentSentenceIndex]?.type}
                        </span>
                        <p style={{ fontWeight: "bold", fontSize: "20px", color: "#4a148c", margin: "10px 0 0 0" }}>
                          {displayedSentences[currentSentenceIndex]?.translation}
                        </p>
                      </div>

                      <div style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>請拖曳下方單字與標點符號卡，排列出正確的德文句子：</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", padding: "20px", backgroundColor: "#fafafa", border: "2px dashed #ccc", marginBottom: "25px", borderRadius: "8px", minHeight: "65px" }}>
                        {sentenceWords.map((word, index) => (
                          <div key={index} draggable onDragStart={() => handleDragStart(index)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
                            style={{ padding: "12px 18px", backgroundColor: draggedIdx === index ? "#ce93d8" : "#ab47bc", color: "white", borderRadius: "8px", cursor: "grab", fontWeight: "bold", fontSize: "18px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", userSelect: "none" }}>
                            {word}
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <button onClick={checkSentenceAnswer} style={{ flex: 2, padding: "14px", backgroundColor: "#9c27b0", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>✨ 驗證語序</button>
                        <button onClick={() => playAudio(displayedSentences[currentSentenceIndex]?.german)} style={{ flex: 1, padding: "14px", backgroundColor: "#4caf50", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>🔊 播放</button>
                        <button onClick={goToNextSentence} disabled={!sentenceCanProceed} style={{ flex: 1, padding: "14px", backgroundColor: sentenceCanProceed ? "#2e7d32" : "#ccc", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: sentenceCanProceed ? "pointer" : "not-allowed" }}>➡️ 下一句</button>
                        <button onClick={revealSentenceAnswer} style={{ flex: 1, padding: "14px", backgroundColor: "#0288d1", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>💡 揭曉答案</button>
                        <button onClick={goToNextSentence} style={{ flex: 1, padding: "14px", backgroundColor: "#757575", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "16px", cursor: "pointer" }}>⏭️ 略過</button>
                      </div>
                      {sentenceFeedback && (
                        <div style={{ marginTop: "20px", padding: "15px", borderRadius: "6px", backgroundColor: getFeedbackStyle(sentenceFeedback.type).bg, color: getFeedbackStyle(sentenceFeedback.type).color, fontWeight: "bold", fontSize: "16px" }}>
                          {sentenceFeedback.text}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "50px", backgroundColor: "#fff", borderRadius: "10px" }}>
              <h3 style={{ color: "#777" }}>資料庫目前空無一物</h3>
              <p style={{ color: "#999" }}>請管理員點擊右上角的「⚙️ 題庫管理後台」（預設密碼 1234）匯入或建立題庫。</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;