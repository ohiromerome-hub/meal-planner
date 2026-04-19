import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEYS = {
  settings: "mealPlanner_settings",
  plan: "mealPlanner_plan",
  checkedItems: "mealPlanner_checkedItems",
  recipes: "mealPlanner_recipes",
};

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const DAY_FULL = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"];

const DAY_EMOJI = {
  月曜日: "🌙",
  火曜日: "🔥",
  水曜日: "💧",
  木曜日: "🌿",
  金曜日: "💛",
  土曜日: "🪐",
  日曜日: "☀️",
};

const AGE_GROUPS = [
  { id: "1-2", label: "1〜2歳", desc: "950〜1050kcal/日", nutrition: "エネルギー950〜1050kcal、たんぱく質20g、野菜180g、穀物80g/食、牛乳250ml、卵25〜30g、肉15〜20g＋魚30g、果物100g" },
  { id: "3-5", label: "3〜5歳", desc: "1200〜1400kcal/日", nutrition: "エネルギー1200〜1400kcal、たんぱく質25g、野菜230g、穀物100g/食、牛乳250ml、卵50g、肉30〜35g＋魚40g、果物150g" },
  { id: "6-11m", label: "6〜11歳（男子）", desc: "2000〜2550kcal/日", nutrition: "エネルギー2000〜2550kcal、たんぱく質30〜60g、穀物720g/日、牛乳400ml、卵50g、肉60g＋魚60g、大豆製品100g" },
  { id: "6-11f", label: "6〜11歳（女子）", desc: "1800〜2400kcal/日", nutrition: "エネルギー1800〜2400kcal、たんぱく質30〜50g、鉄8.5〜10mg、穀物600g/日、牛乳400ml、卵50g、肉50〜60g" },
];

const DISH_ROLES = {
  staple: { label: "主食", bg: "#E6F1FB", color: "#185FA5" },
  main:   { label: "主菜", bg: "#FAECE7", color: "#993C1D" },
  side:   { label: "副菜", bg: "#EAF3DE", color: "#3B6D11" },
};

const MEAL_TYPES = ["朝食", "昼食", "夕食"];

const DEFAULT_SETTINGS = {
  childAgeGroups: ["1-2"],
  nurseryDays: [],
  avoidFoods: [],
  adults: 2,
  children: 1,
};

function loadFromStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

export default function App() {
  // --- State ---
  const [tab, setTab] = useState("settings");
  const [settings, setSettings] = useState(() => {
    const saved = loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    // Migrate: ageGroup → childAgeGroups
    if (saved.ageGroup && !saved.childAgeGroups) {
      saved.childAgeGroups = [saved.ageGroup];
      delete saved.ageGroup;
    }
    // Migrate: familySize → adults/children
    if (saved.familySize && !saved.adults) {
      const match = saved.familySize.match(/(\d+)/);
      const total = match ? parseInt(match[1]) : 3;
      saved.adults = Math.max(1, total - 1);
      saved.children = 1;
      delete saved.familySize;
    }
    // Ensure childAgeGroups matches children count
    const count = saved.children ?? 1;
    const groups = saved.childAgeGroups || ["1-2"];
    if (groups.length < count) {
      saved.childAgeGroups = [...groups, ...Array(count - groups.length).fill("1-2")];
    }
    return saved;
  });
  const [plan, setPlan] = useState(() => loadFromStorage(STORAGE_KEYS.plan, null));
  const [loading, setLoading] = useState(false);
  const [regeneratingDay, setRegeneratingDay] = useState(null);
  const [checkedItems, setCheckedItems] = useState(() =>
    loadFromStorage(STORAGE_KEYS.checkedItems, {})
  );
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tabTransition, setTabTransition] = useState(false);
  const [avoidInput, setAvoidInput] = useState("");
  const [recipes, setRecipes] = useState(() => loadFromStorage(STORAGE_KEYS.recipes, {}));
  const [loadingRecipe, setLoadingRecipe] = useState(null);
  const [openRecipe, setOpenRecipe] = useState(null);
  const prevTabRef = useRef(tab);

  // --- Persist to localStorage ---
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    if (plan) saveToStorage(STORAGE_KEYS.plan, plan);
  }, [plan]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.checkedItems, checkedItems);
  }, [checkedItems]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.recipes, recipes);
  }, [recipes]);


  // --- Tab transition ---
  const switchTab = useCallback((newTab) => {
    setTabTransition(true);
    setError(null);
    setTimeout(() => {
      setTab(newTab);
      setTabTransition(false);
    }, 150);
  }, []);

  useEffect(() => {
    prevTabRef.current = tab;
  }, [tab]);

  // --- Settings handlers ---
  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setChildrenCount = useCallback((newCount) => {
    setSettings((prev) => {
      const current = prev.childAgeGroups || ["1-2"];
      let newGroups;
      if (newCount > current.length) {
        // 増えた分はデフォルト"1-2"で追加
        newGroups = [...current, ...Array(newCount - current.length).fill("1-2")];
      } else {
        // 減った分を末尾から削除
        newGroups = current.slice(0, newCount);
      }
      return { ...prev, children: newCount, childAgeGroups: newGroups };
    });
  }, []);

  const setChildAgeGroup = useCallback((childIdx, ageId) => {
    setSettings((prev) => {
      const groups = [...(prev.childAgeGroups || ["1-2"])];
      groups[childIdx] = ageId;
      return { ...prev, childAgeGroups: groups };
    });
  }, []);

  const toggleNurseryDay = useCallback((dayIdx) => {
    setSettings((prev) => {
      const days = prev.nurseryDays || [];
      return {
        ...prev,
        nurseryDays: days.includes(dayIdx) ? days.filter((d) => d !== dayIdx) : [...days, dayIdx],
      };
    });
  }, []);

  const addAvoidFood = useCallback(() => {
    const t = avoidInput.trim();
    if (t && !(settings.avoidFoods || []).includes(t)) {
      updateSetting("avoidFoods", [...(settings.avoidFoods || []), t]);
    }
    setAvoidInput("");
  }, [avoidInput, settings.avoidFoods, updateSetting]);

  const removeAvoidFood = useCallback((food) => {
    updateSetting("avoidFoods", (settings.avoidFoods || []).filter((f) => f !== food));
  }, [settings.avoidFoods, updateSetting]);

  // --- Build prompt ---
  const buildPrompt = useCallback(
    (singleDay = null, existingPlan = null) => {
      const childAgeGroups = (settings.childAgeGroups || ["1-2"]).slice(0, settings.children ?? 1);
      const childAgeInfos = childAgeGroups.map((id, i) => {
        const ag = AGE_GROUPS.find((a) => a.id === id);
        return { idx: i + 1, ...(ag || AGE_GROUPS[0]) };
      });
      const childAgeStr = childAgeInfos.map((c) =>
        childAgeInfos.length > 1 ? `子ども${c.idx}: ${c.label}` : c.label
      ).join("、");
      const nurseryDays = settings.nurseryDays || [];
      const nurseryStr = nurseryDays.length > 0
        ? `保育園がある曜日（昼食除外）: ${nurseryDays.map((i) => DAY_FULL[i]).join("、")}`
        : "保育園なし（全曜日3食）";
      const avoidStr = (settings.avoidFoods || []).length > 0 ? `苦手食材: ${settings.avoidFoods.join("、")}` : "特になし";
      const nutritionBlock = childAgeInfos.map((c) =>
        childAgeInfos.length > 1
          ? `子ども${c.idx}（${c.label}）: ${c.nutrition}`
          : `${c.label}: ${c.nutrition}`
      ).join("\n");

      const base = `あなたは子どもと大人の家族向け週間献立プランナーです。
子ども年齢: ${childAgeStr} / ${nurseryStr} / ${avoidStr}
家族人数: ${familySizeLabel}

【栄養目標】
${nutritionBlock || "指定なし"}

【重要な制約】
- 週全体で使うメニューは4〜5種類に絞る（同じメニューを複数日・複数食で使い回しOK）
- すべてのメニューは冷凍保存可能であること
- 週の全メニューをまとめて作り置きした場合、合計調理時間が約1時間以内
- 電子レンジで解凍・温め直しができること
- 子どもと大人が取り分けできること
- 必ず1食に主食・主菜・副菜の3点セットを揃えること

【主食・主菜・副菜の定義】
- 主食(staple): ごはん・パン・麺など炭水化物中心
- 主菜(main): 肉・魚・卵・大豆製品などたんぱく質中心
- 副菜(side): 野菜・きのこ・海藻などビタミン・ミネラル中心`;

      if (singleDay && existingPlan) {
        const otherMeals = existingPlan.days
          .filter((d) => d.day !== singleDay)
          .map((d) => {
            const meals = d.meals || {};
            const names = Object.values(meals).flatMap((m) => [m?.staple?.name, m?.main?.name, m?.side?.name].filter(Boolean));
            return `${d.day}: ${names.join("、")}`;
          }).join("\n");

        return `${base}

以下の既存献立と重複しない${singleDay}の献立を1日分だけ作ってください:
${otherMeals}

以下のJSON形式で返してください（${singleDay}の1日分のみ）:
\`\`\`json
{
  "day": "${singleDay}",
  "meals": {
    "朝食": { "staple": {"name":"主食名","desc":"20字以内"}, "main": {"name":"主菜名","desc":"20字以内","baby":"子どもアレンジ15字以内"}, "side": {"name":"副菜名","desc":"20字以内"} },
    "夕食": { "staple": {"name":"主食名","desc":"20字以内"}, "main": {"name":"主菜名","desc":"20字以内","baby":"子どもアレンジ15字以内"}, "side": {"name":"副菜名","desc":"20字以内"} }
  }
}
\`\`\`
${nurseryDays.includes(DAY_FULL.indexOf(singleDay)) ? "この日は保育園なので昼食は省略。" : "昼食も含めてください。"}
JSONのみ返してください。`;
      }

      return `${base}

以下のJSON形式のみで返してください（他のテキスト不要）:
\`\`\`json
{
  "cookingTips": "まとめ調理のコツを1〜2文で",
  "menuList": ["メニュー名1", "メニュー名2", "メニュー名3", "メニュー名4"],
  "prepTimeline": [
    {"timing": "週末（日曜午後）", "tasks": ["下ごしらえ1", "下ごしらえ2"]},
    {"timing": "月曜朝", "tasks": ["タスク1"]}
  ],
  "estimatedWeeklyCost": {"min": 8000, "max": 12000},
  "days": [
    {
      "day": "月曜日",
      "meals": {
        "朝食": {
          "staple": { "name": "主食名", "desc": "20文字以内" },
          "main":   { "name": "主菜名", "desc": "20文字以内", "baby": "子どもアレンジ15文字以内" },
          "side":   { "name": "副菜名", "desc": "20文字以内" }
        },
        "昼食": {
          "staple": { "name": "主食名", "desc": "20文字以内" },
          "main":   { "name": "主菜名", "desc": "20文字以内", "baby": "子どもアレンジ15文字以内" },
          "side":   { "name": "副菜名", "desc": "20文字以内" }
        },
        "夕食": {
          "staple": { "name": "主食名", "desc": "20文字以内" },
          "main":   { "name": "主菜名", "desc": "20文字以内", "baby": "子どもアレンジ15文字以内" },
          "side":   { "name": "副菜名", "desc": "20文字以内" }
        }
      }
    }
  ],
  "groceries": {
    "野菜・果物": ["にんじん 3本", "ほうれん草 2束"],
    "肉類": ["鶏もも肉 300g"],
    "魚介類": ["鮭 2切れ"],
    "乳製品・卵": ["卵 6個"],
    "調味料・乾物": ["味噌"],
    "その他": ["豆腐 2丁"]
  }
}
\`\`\`
分量は${familySizeLabel}分で計算。保育園の日はmealsから昼食キーを省略。7日分すべて含めること。
estimatedWeeklyCostは${familySizeShort}分の概算食費（円）。
prepTimelineは週末の作り置き・平日の効率的な調理手順。`;
    },
    [settings]
  );

  // --- API call (Gemini direct with retry) ---
  const callAI = useCallback(async (prompt) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("APIキーが設定されていません");

    const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite"];
    let lastError = null;

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 8000,
                },
              }),
            }
          );

          if (response.status === 503) {
            lastError = new Error("サーバーが混雑しています。リトライ中...");
            continue;
          }
          if (response.status === 404) {
            lastError = new Error(`モデル ${model} は利用できません`);
            break; // skip to next model
          }
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `API error: ${response.status}`);
          }

          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

          const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
          if (!jsonMatch) throw new Error("JSONの解析に失敗しました。再生成してください。");

          return JSON.parse(jsonMatch[1]);
        } catch (e) {
          lastError = e;
          if (e.message.includes("リトライ中")) continue;
          if (!e.message.includes("利用できません")) throw e;
        }
      }
    }
    throw lastError || new Error("すべてのモデルで生成に失敗しました");
  }, []);

  // --- API call (text response, no JSON parse) ---
  const callAIText = useCallback(async (prompt) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("APIキーが設定されていません");

    const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite"];
    let lastError = null;

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
              }),
            }
          );
          if (response.status === 503) { lastError = new Error("サーバー混雑"); continue; }
          if (response.status === 404) { lastError = new Error(`モデル ${model} 利用不可`); break; }
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `API error: ${response.status}`);
          }
          const data = await response.json();
          return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } catch (e) {
          lastError = e;
          if (e.message.includes("混雑")) continue;
          if (!e.message.includes("利用不可")) throw e;
        }
      }
    }
    throw lastError || new Error("レシピの取得に失敗しました");
  }, []);

  // --- Generate full plan ---
  const generatePlan = useCallback(async () => {
    setError(null);
    setLoading(true);
    switchTab("plan");

    try {
      const prompt = buildPrompt();
      const result = await callAI(prompt);
      if (!result?.days) throw new Error("献立の解析に失敗しました。再生成してください。");
      setPlan(result);
      setCheckedItems({});
      saveToStorage(STORAGE_KEYS.checkedItems, {});
    } catch (e) {
      setError(`献立の生成に失敗しました: ${e.message}`);
      switchTab("settings");
    } finally {
      setLoading(false);
    }
  }, [settings, buildPrompt, callAI, switchTab]);

  // --- Regenerate single day ---
  const regenerateDay = useCallback(
    async (dayName) => {
      if (!plan) return;
      setRegeneratingDay(dayName);
      setError(null);

      try {
        const prompt = buildPrompt(dayName, plan);
        const result = await callAI(prompt);

        setPlan((prev) => {
          const newDays = prev.days.map((d) =>
            d.day === dayName ? result : d
          );
          // Recalculate grocery list would require another API call
          // For now just update the day
          return { ...prev, days: newDays };
        });
      } catch (e) {
        setError(`${dayName}の再生成に失敗しました: ${e.message}`);
      } finally {
        setRegeneratingDay(null);
      }
    },
    [plan, buildPrompt, callAI]
  );

  // --- Grocery list helpers ---
  const toggleCheck = useCallback((category, itemName) => {
    const key = `${category}__${itemName}`;
    setCheckedItems((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });
  }, []);

  const groceryData = plan?.groceries || {};
  const groceryCategories = ["野菜・果物", "肉類", "魚介類", "乳製品・卵", "調味料・乾物", "その他"];

  const groceryStats = useCallback(() => {
    let total = 0;
    let checked = 0;
    groceryCategories.forEach((cat) => {
      const items = groceryData[cat] || [];
      items.forEach((item) => {
        total++;
        if (checkedItems[`${cat}__${item}`]) checked++;
      });
    });
    return { total, checked };
  }, [groceryData, checkedItems]);

  const copyGroceryList = useCallback(() => {
    if (!groceryData) return;
    const text = groceryCategories
      .filter((cat) => (groceryData[cat] || []).length > 0)
      .map((cat) => `【${cat}】\n${groceryData[cat].map((i) => `  ${i}`).join("\n")}`)
      .join("\n\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [groceryData]);

  // --- Family size helper ---
  const totalFamily = (settings.adults || 2) + (settings.children ?? 1);
  const familySizeLabel = `大人${settings.adults || 2}人・子ども${settings.children ?? 1}人（計${totalFamily}人）`;
  const familySizeShort = `${totalFamily}人`;

  // --- Generate recipe for a dish ---
  const generateRecipe = useCallback(async (dishName) => {
    if (recipes[dishName]) {
      setOpenRecipe(dishName);
      return;
    }
    setLoadingRecipe(dishName);
    try {
      const childAgeGroups = (settings.childAgeGroups || ["1-2"]).slice(0, settings.children ?? 1);
      const childAgeStr = childAgeGroups.map((id) => AGE_GROUPS.find((a) => a.id === id)?.label || id).join("・");

      const prompt = `「${dishName}」の家庭向けレシピを教えてください。

条件:
- 家族構成: ${familySizeLabel}（子ども: ${childAgeStr}）
- 作り置き・冷凍保存を前提
- 子どもと大人の取り分けができること
${(settings.avoidFoods || []).length > 0 ? `- 避ける食材: ${settings.avoidFoods.join("、")}` : ""}

以下の形式で簡潔に回答してください:

【材料】（${familySizeShort}分）
・食材名 分量

【作り方】
1. 手順
2. 手順

【子どもアレンジ】
・ポイント

【保存方法】
・冷凍/冷蔵の目安`;

      const text = await callAIText(prompt);
      setRecipes((prev) => ({ ...prev, [dishName]: text }));
      setOpenRecipe(dishName);
    } catch (e) {
      setError(`レシピの取得に失敗しました: ${e.message}`);
    } finally {
      setLoadingRecipe(null);
    }
  }, [recipes, settings, familySizeLabel, familySizeShort, callAIText]);

  // --- Settings summary ---
  const settingsSummary = () => {
    const parts = [];
    const childAges = (settings.childAgeGroups || ["1-2"]).slice(0, settings.children ?? 1);
    const ageLabels = childAges.map((id) => AGE_GROUPS.find((a) => a.id === id)?.label || id);
    parts.push(ageLabels.join("・"));
    parts.push(familySizeShort);
    const nurseryDays = settings.nurseryDays || [];
    if (nurseryDays.length > 0) parts.push("園給食あり");
    if ((settings.avoidFoods || []).length > 0) parts.push(`NG: ${settings.avoidFoods.join("、")}`);
    return parts.join(" / ");
  };

  // --- Styles ---
  const styles = {
    // Inject responsive CSS
    globalStyle: `
      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @media (max-width: 639px) {
        .week-grid { grid-template-columns: 1fr !important; }
        .age-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .tab-bar { gap: 4px !important; }
        .tab-bar button { font-size: 13px !important; padding: 8px 10px !important; }
        .settings-card { padding: 16px !important; }
        .header-title { font-size: 22px !important; }
      }
      @media (min-width: 640px) and (max-width: 1023px) {
        .week-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
    `,

    container: {
      maxWidth: 960,
      margin: "0 auto",
      padding: "24px 16px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: "#1a1a2e",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #faf8ff 0%, #f0f4ff 50%, #fef9f4 100%)",
    },

    header: {
      textAlign: "center",
      marginBottom: 32,
    },

    headerTitle: {
      fontSize: 28,
      fontWeight: 800,
      background: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      margin: 0,
    },

    headerSub: {
      fontSize: 14,
      color: "#888",
      marginTop: 4,
    },

    tabBar: {
      display: "flex",
      gap: 8,
      marginBottom: 24,
      borderBottom: "2px solid #eee",
      paddingBottom: 0,
    },

    tabButton: (active) => ({
      padding: "10px 20px",
      border: "none",
      borderBottom: active ? "3px solid #6c5ce7" : "3px solid transparent",
      background: "none",
      color: active ? "#6c5ce7" : "#999",
      fontWeight: active ? 700 : 500,
      fontSize: 15,
      cursor: "pointer",
      transition: "all 0.2s ease",
      marginBottom: -2,
    }),

    tabContent: {
      opacity: tabTransition ? 0 : 1,
      transform: tabTransition ? "translateY(4px)" : "translateY(0)",
      transition: "opacity 0.15s ease, transform 0.15s ease",
    },

    card: {
      background: "#fff",
      borderRadius: 16,
      padding: 24,
      marginBottom: 20,
      boxShadow: "0 2px 12px rgba(108,92,231,0.06)",
      border: "1px solid #f0eef5",
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight: 700,
      marginBottom: 12,
      color: "#2d2d44",
      display: "flex",
      alignItems: "center",
      gap: 8,
    },

    ageGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 8,
    },

    ageButton: (selected) => ({
      padding: "10px 12px",
      border: selected ? "2px solid #6c5ce7" : "2px solid #e8e6f0",
      borderRadius: 12,
      background: selected
        ? "linear-gradient(135deg, #6c5ce7, #a29bfe)"
        : "#faf9ff",
      color: selected ? "#fff" : "#555",
      fontWeight: selected ? 700 : 500,
      fontSize: 13,
      cursor: "pointer",
      transition: "all 0.2s ease",
      textAlign: "center",
    }),

    toggleRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 0",
    },

    toggle: (on) => ({
      width: 48,
      height: 26,
      borderRadius: 13,
      background: on ? "#6c5ce7" : "#ddd",
      border: "none",
      cursor: "pointer",
      position: "relative",
      transition: "background 0.2s ease",
    }),

    toggleDot: (on) => ({
      width: 22,
      height: 22,
      borderRadius: 11,
      background: "#fff",
      position: "absolute",
      top: 2,
      left: on ? 24 : 2,
      transition: "left 0.2s ease",
      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    }),

    textInput: {
      width: "100%",
      padding: "10px 14px",
      border: "2px solid #e8e6f0",
      borderRadius: 12,
      fontSize: 14,
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    },

    primaryButton: {
      width: "100%",
      padding: "16px",
      background: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
      color: "#fff",
      border: "none",
      borderRadius: 14,
      fontSize: 16,
      fontWeight: 700,
      cursor: "pointer",
      transition: "transform 0.1s ease, box-shadow 0.2s ease",
      boxShadow: "0 4px 15px rgba(108,92,231,0.3)",
    },

    weekGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 16,
    },

    dayCard: {
      background: "#fff",
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 2px 10px rgba(108,92,231,0.06)",
      border: "1px solid #f0eef5",
      animation: "fadeIn 0.3s ease both",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
    },

    dayHeader: {
      padding: "10px 14px",
      background: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
      color: "#fff",
      fontWeight: 700,
      fontSize: 14,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },

    refreshButton: {
      background: "rgba(255,255,255,0.2)",
      border: "none",
      color: "#fff",
      width: 28,
      height: 28,
      borderRadius: "50%",
      cursor: "pointer",
      fontSize: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.2s ease",
    },

    mealItem: {
      padding: "10px 14px",
      borderBottom: "1px solid #f5f4f8",
    },

    mealType: (type) => ({
      fontSize: 11,
      fontWeight: 700,
      color:
        type === "朝食" ? "#e17055" : type === "昼食" ? "#00b894" : "#6c5ce7",
      marginBottom: 2,
    }),

    mealName: {
      fontSize: 14,
      fontWeight: 600,
      color: "#2d2d44",
      marginBottom: 3,
    },

    mealMeta: {
      fontSize: 11,
      color: "#999",
    },

    mealTip: {
      fontSize: 11,
      color: "#6c5ce7",
      fontStyle: "italic",
      marginTop: 3,
    },

    skeleton: {
      background: "linear-gradient(90deg, #f0eef5 25%, #e8e6f0 50%, #f0eef5 75%)",
      backgroundSize: "200% 100%",
      animation: "pulse 1.5s ease-in-out infinite",
      borderRadius: 14,
      height: 260,
    },

    spinner: {
      width: 20,
      height: 20,
      border: "3px solid rgba(255,255,255,0.3)",
      borderTop: "3px solid #fff",
      borderRadius: "50%",
      animation: "spin 0.6s linear infinite",
      display: "inline-block",
    },

    groceryCategory: {
      marginBottom: 16,
    },

    groceryCategoryTitle: {
      fontSize: 14,
      fontWeight: 700,
      color: "#6c5ce7",
      marginBottom: 8,
      paddingBottom: 4,
      borderBottom: "1px solid #f0eef5",
    },

    groceryItem: (checked) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "6px 0",
      fontSize: 14,
      color: checked ? "#bbb" : "#444",
      textDecoration: checked ? "line-through" : "none",
      cursor: "pointer",
      transition: "color 0.2s ease",
    }),

    checkbox: (checked) => ({
      width: 20,
      height: 20,
      borderRadius: 6,
      border: checked ? "none" : "2px solid #d0cfe0",
      background: checked
        ? "linear-gradient(135deg, #6c5ce7, #a29bfe)"
        : "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: 12,
      flexShrink: 0,
      transition: "all 0.2s ease",
    }),

    progressBar: {
      width: "100%",
      height: 8,
      background: "#f0eef5",
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 16,
    },

    progressFill: (pct) => ({
      width: `${pct}%`,
      height: "100%",
      background: "linear-gradient(90deg, #6c5ce7, #a29bfe)",
      borderRadius: 4,
      transition: "width 0.3s ease",
    }),

    copyButton: (isCopied) => ({
      padding: "8px 16px",
      background: isCopied ? "#00b894" : "#f0eef5",
      color: isCopied ? "#fff" : "#6c5ce7",
      border: "none",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s ease",
    }),

    emptyState: {
      textAlign: "center",
      padding: "60px 20px",
    },

    emptyEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },

    emptyText: {
      fontSize: 16,
      color: "#999",
      marginBottom: 16,
    },

    backLink: {
      color: "#6c5ce7",
      fontSize: 14,
      cursor: "pointer",
      textDecoration: "underline",
      background: "none",
      border: "none",
      fontWeight: 600,
    },

    settingsSummary: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: "#f0eef5",
      padding: "6px 14px",
      borderRadius: 20,
      fontSize: 13,
      color: "#6c5ce7",
      fontWeight: 600,
      marginBottom: 16,
    },

    timelineCard: {
      background: "#fff",
      borderRadius: 14,
      padding: 20,
      marginBottom: 20,
      boxShadow: "0 2px 10px rgba(108,92,231,0.06)",
      border: "1px solid #f0eef5",
    },

    timelineItem: {
      display: "flex",
      gap: 12,
      marginBottom: 12,
      paddingBottom: 12,
      borderBottom: "1px solid #f8f7fc",
    },

    timelineBadge: {
      background: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
      color: "#fff",
      padding: "4px 10px",
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: "nowrap",
      alignSelf: "flex-start",
    },

    timelineTasks: {
      fontSize: 13,
      color: "#555",
      lineHeight: 1.6,
    },

    costBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: "#fff8f0",
      border: "1px solid #ffe0b2",
      padding: "8px 14px",
      borderRadius: 10,
      fontSize: 14,
      color: "#e17055",
      fontWeight: 600,
      marginBottom: 16,
    },

    error: {
      background: "#fff0f0",
      border: "1px solid #ffcccc",
      color: "#cc3333",
      padding: "12px 16px",
      borderRadius: 12,
      marginBottom: 16,
      fontSize: 14,
    },
  };

  // --- Render: Settings Tab ---
  const renderSettings = () => (
    <div style={styles.tabContent}>
      {/* Family size — moved above age group */}
      <div style={styles.card} className="settings-card">
        <div style={styles.sectionTitle}><span>👨‍👩‍👧‍👦</span> 家族の人数</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          {/* Adults */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>🧑 大人</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => updateSetting("adults", Math.max(1, (settings.adults || 2) - 1))} style={{ width: 36, height: 36, borderRadius: 10, border: "2px solid #e8e6f0", background: "#faf9ff", cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#6c5ce7", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#2d2d44", minWidth: 28, textAlign: "center" }}>{settings.adults || 2}</span>
              <button onClick={() => updateSetting("adults", Math.min(6, (settings.adults || 2) + 1))} style={{ width: 36, height: 36, borderRadius: 10, border: "2px solid #e8e6f0", background: "#faf9ff", cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#6c5ce7", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              <span style={{ fontSize: 13, color: "#999" }}>人</span>
            </div>
          </div>
          {/* Children */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>👶 子ども</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setChildrenCount(Math.max(0, (settings.children ?? 1) - 1))} style={{ width: 36, height: 36, borderRadius: 10, border: "2px solid #e8e6f0", background: "#faf9ff", cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#6c5ce7", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#2d2d44", minWidth: 28, textAlign: "center" }}>{settings.children ?? 1}</span>
              <button onClick={() => setChildrenCount(Math.min(6, (settings.children ?? 1) + 1))} style={{ width: 36, height: 36, borderRadius: 10, border: "2px solid #e8e6f0", background: "#faf9ff", cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#6c5ce7", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              <span style={{ fontSize: 13, color: "#999" }}>人</span>
            </div>
          </div>
        </div>
        {/* Total */}
        <div style={{ background: "linear-gradient(135deg, #f8f7fc, #f0eef5)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#888" }}>合計</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#6c5ce7" }}>{totalFamily}</span>
          <span style={{ fontSize: 13, color: "#888" }}>人家族</span>
        </div>
      </div>

      {/* Age groups per child */}
      {(settings.children ?? 1) > 0 && (
        <div style={styles.card} className="settings-card">
          <div style={styles.sectionTitle}><span>👶</span> 子どもの年齢グループ</div>
          {(settings.childAgeGroups || ["1-2"]).slice(0, settings.children ?? 1).map((ageId, idx) => {
            const childNum = (settings.children ?? 1) > 1 ? `（${idx + 1}人目）` : "";
            const selectedAge = AGE_GROUPS.find((a) => a.id === ageId);
            return (
              <div key={idx} style={{ marginBottom: idx < (settings.children ?? 1) - 1 ? 16 : 0 }}>
                {(settings.children ?? 1) > 1 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#6c5ce7", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #6c5ce7, #a29bfe)", color: "#fff", fontSize: 11, fontWeight: 700 }}>{idx + 1}</span>
                    {idx + 1}人目の子ども
                  </div>
                )}
                <div style={styles.ageGrid} className="age-grid">
                  {AGE_GROUPS.map((ag) => (
                    <button key={ag.id} style={styles.ageButton(ageId === ag.id)} onClick={() => setChildAgeGroup(idx, ag.id)}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{ag.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{ag.desc}</div>
                    </button>
                  ))}
                </div>
                {selectedAge && (
                  <div style={{ marginTop: 8, padding: "6px 12px", background: "#f8f7fc", borderRadius: 10, fontSize: 11, color: "#888", lineHeight: 1.7 }}>
                    栄養目標: {selectedAge.nutrition}
                  </div>
                )}
                {idx < (settings.children ?? 1) - 1 && (
                  <div style={{ borderBottom: "1px dashed #e8e6f0", marginTop: 16 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nursery days */}
      <div style={styles.card} className="settings-card">
        <div style={styles.sectionTitle}><span>🏫</span> 保育園に行く曜日</div>
        <div style={{ fontSize: 12, color: "#999", marginBottom: 10 }}>選択した曜日の昼食を除外します</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DAYS.map((d, i) => {
            const active = (settings.nurseryDays || []).includes(i);
            return (
              <button key={i} onClick={() => toggleNurseryDay(i)} style={{
                width: 44, height: 44, borderRadius: 12, fontSize: 14, fontWeight: active ? 700 : 400, cursor: "pointer",
                border: active ? "2px solid #6c5ce7" : "2px solid #e8e6f0",
                background: active ? "linear-gradient(135deg, #6c5ce7, #a29bfe)" : "#faf9ff",
                color: active ? "#fff" : "#555", transition: "all 0.2s ease",
              }}>{d}</button>
            );
          })}
        </div>
      </div>

      {/* Avoid foods */}
      <div style={styles.card} className="settings-card">
        <div style={styles.sectionTitle}><span>🚫</span> 苦手な食材・アレルギー</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            style={styles.textInput}
            placeholder="例：なす、セロリ…"
            value={avoidInput}
            onChange={(e) => setAvoidInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAvoidFood()}
            onFocus={(e) => (e.target.style.borderColor = "#6c5ce7")}
            onBlur={(e) => (e.target.style.borderColor = "#e8e6f0")}
          />
          <button onClick={addAvoidFood} style={{ padding: "8px 16px", borderRadius: 10, border: "2px solid #e8e6f0", background: "#faf9ff", cursor: "pointer", fontSize: 14, whiteSpace: "nowrap" }}>追加</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(settings.avoidFoods || []).length === 0
            ? <span style={{ fontSize: 13, color: "#bbb" }}>未登録</span>
            : (settings.avoidFoods || []).map((f) => (
              <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: 13, borderRadius: 20, background: "#fff0f0", color: "#cc3333", border: "1px solid #ffcccc" }}>
                {f}
                <button onClick={() => removeAvoidFood(f)} style={{ cursor: "pointer", fontSize: 11, background: "none", border: "none", color: "#cc3333", padding: 0, lineHeight: 1 }}>✕</button>
              </span>
            ))}
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <button style={styles.primaryButton} onClick={generatePlan}
        onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 6px 20px rgba(108,92,231,0.4)"; }}
        onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 4px 15px rgba(108,92,231,0.3)"; }}
      >
        🍽️ 今週の献立を生成する
      </button>
    </div>
  );

  // --- Render: Plan Tab ---
  const renderPlan = () => {
    if (loading) {
      return (
        <div style={styles.tabContent}>
          <div style={{ textAlign: "center", marginBottom: 20, color: "#999", fontSize: 14 }}>
            <p>🧑‍🍳 AIが献立を考えています...</p>
            <p style={{ fontSize: 12 }}>栄養バランスと作り置きの効率を考慮中</p>
          </div>
          <div style={styles.weekGrid} className="week-grid">
            {DAY_FULL.map((day) => <div key={day} style={styles.skeleton} />)}
          </div>
        </div>
      );
    }

    if (!plan) {
      return (
        <div style={styles.tabContent}>
          <div style={styles.emptyState}>
            <div style={styles.emptyEmoji}>🍳</div>
            <div style={styles.emptyText}>まだ献立が作成されていません</div>
            <button style={styles.backLink} onClick={() => switchTab("settings")}>設定に戻って生成する →</button>
          </div>
        </div>
      );
    }

    const nurseryDays = settings.nurseryDays || [];
    const MEAL_COLORS = { 朝食: { bg: "#FAEEDA", color: "#854F0B" }, 昼食: { bg: "#E1F5EE", color: "#0F6E56" }, 夕食: { bg: "#E6F1FB", color: "#185FA5" } };

    return (
      <div style={styles.tabContent}>
        <div style={styles.settingsSummary}>
          <span>⚙️</span> {settingsSummary()}
        </div>

        {/* Cooking tips */}
        {plan.cookingTips && (
          <div style={{ background: "#E1F5EE", border: "1px solid #9FE1CB", borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🧊</span>
            <p style={{ fontSize: 13, color: "#085041", margin: 0, lineHeight: 1.6 }}>{plan.cookingTips}</p>
          </div>
        )}

        {/* Menu list */}
        {plan.menuList?.length > 0 && (
          <div style={{ background: "#faf9ff", border: "1px solid #f0eef5", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: "#999", margin: "0 0 8px", fontWeight: 600 }}>今週使うメニュー（{plan.menuList.length}種類）</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {plan.menuList.map((m, i) => (
                <span key={i} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 20, background: "#fff", border: "1px solid #e8e6f0" }}>{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* Prep Timeline */}
        {plan.prepTimeline?.length > 0 && (
          <div style={styles.timelineCard}>
            <div style={styles.sectionTitle}><span>⏰</span> まとめ調理タイムライン</div>
            {plan.prepTimeline.map((item, idx) => (
              <div key={idx} style={{ ...styles.timelineItem, borderBottom: idx === plan.prepTimeline.length - 1 ? "none" : styles.timelineItem.borderBottom }}>
                <div style={styles.timelineBadge}>{item.timing}</div>
                <div style={styles.timelineTasks}>{item.tasks.map((t, i) => <div key={i}>・{t}</div>)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Day cards */}
        <div style={styles.weekGrid} className="week-grid">
          {plan.days.map((day, idx) => {
            const dayIdx = DAY_FULL.indexOf(day.day);
            const isNursery = nurseryDays.includes(dayIdx);
            return (
              <div key={day.day} style={{ ...styles.dayCard, animationDelay: `${idx * 0.05}s` }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(108,92,231,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(108,92,231,0.06)"; }}
              >
                <div style={styles.dayHeader}>
                  <span>{DAY_EMOJI[day.day] || ""} {day.day}{isNursery ? " 🏫" : ""}</span>
                  <button style={styles.refreshButton} onClick={(e) => { e.stopPropagation(); regenerateDay(day.day); }}
                    title={`${day.day}を再生成`} disabled={regeneratingDay !== null}>
                    {regeneratingDay === day.day ? <div style={{ ...styles.spinner, width: 14, height: 14, borderWidth: 2 }} /> : "↻"}
                  </button>
                </div>

                {regeneratingDay === day.day ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>
                    <div style={{ ...styles.spinner, borderColor: "rgba(108,92,231,0.2)", borderTopColor: "#6c5ce7", margin: "0 auto 8px" }} />
                    再生成中...
                  </div>
                ) : (
                  MEAL_TYPES.map((meal) => {
                    if (meal === "昼食" && isNursery) {
                      return <div key={meal} style={{ padding: "8px 14px", borderBottom: "1px solid #f5f4f8", fontSize: 12, color: "#bbb", fontStyle: "italic" }}>昼食：保育園給食</div>;
                    }
                    const mealData = day.meals?.[meal];
                    if (!mealData) return null;
                    const mc = MEAL_COLORS[meal];
                    return (
                      <div key={meal} style={styles.mealItem}>
                        <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: mc.bg, color: mc.color, marginBottom: 6 }}>{meal}</div>
                        {["staple", "main", "side"].map((role) => {
                          const dish = mealData[role];
                          if (!dish) return null;
                          const rc = DISH_ROLES[role];
                          return (
                            <div key={role} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, flexShrink: 0, marginTop: 2, background: rc.bg, color: rc.color, fontWeight: 600 }}>{rc.label}</span>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 1px", color: "#2d2d44" }}>{dish.name}</p>
                                {dish.desc && <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.4 }}>{dish.desc}</p>}
                                {dish.baby && <p style={{ fontSize: 10, color: "#6c5ce7", margin: "1px 0 0", lineHeight: 1.4 }}>👶 {dish.baby}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>

        <button style={{ ...styles.primaryButton, marginTop: 20 }} onClick={generatePlan}>
          🔄 献立を再生成する
        </button>
      </div>
    );
  };

  // --- Render: Grocery Tab ---
  const renderGrocery = () => {
    const hasGrocery = Object.keys(groceryData).some((k) => (groceryData[k] || []).length > 0);
    if (!hasGrocery) {
      return (
        <div style={styles.tabContent}>
          <div style={styles.emptyState}>
            <div style={styles.emptyEmoji}>🛒</div>
            <div style={styles.emptyText}>買い物リストがまだありません</div>
            <button style={styles.backLink} onClick={() => switchTab("settings")}>献立を生成すると自動で作成されます</button>
          </div>
        </div>
      );
    }

    const { total, checked } = groceryStats();
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

    return (
      <div style={styles.tabContent}>
        <div style={styles.card}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={styles.sectionTitle}><span>🛒</span> 買い物リスト（{familySizeShort}分）</div>
            <button style={styles.copyButton(copied)} onClick={copyGroceryList}>
              {copied ? "✓ コピー完了" : "📋 コピー"}
            </button>
          </div>

          {/* Estimated cost */}
          {plan?.estimatedWeeklyCost && (
            <div style={styles.costBadge}>
              <span>💰</span>
              週間食費の目安: {plan.estimatedWeeklyCost.min?.toLocaleString()}〜{plan.estimatedWeeklyCost.max?.toLocaleString()}円
            </div>
          )}

          {/* Progress */}
          <div style={{ fontSize: 13, color: "#999", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>チェック済み</span>
            <span>{checked}/{total}（{pct}%）</span>
          </div>
          <div style={styles.progressBar}>
            <div style={styles.progressFill(pct)} />
          </div>

          {/* Items by category */}
          {groceryCategories.map((cat) => {
            const items = groceryData[cat] || [];
            if (items.length === 0) return null;
            return (
              <div key={cat} style={styles.groceryCategory}>
                <div style={styles.groceryCategoryTitle}>{cat}</div>
                {items.map((item) => {
                  const key = `${cat}__${item}`;
                  const isChecked = !!checkedItems[key];
                  return (
                    <div key={item} style={styles.groceryItem(isChecked)} onClick={() => toggleCheck(cat, item)}>
                      <div style={styles.checkbox(isChecked)}>{isChecked && "✓"}</div>
                      <span>{item}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- Render: Recipe Tab ---
  const renderRecipe = () => {
    // Collect unique dish names from the plan
    const dishes = [];
    const seen = new Set();
    if (plan?.days) {
      plan.days.forEach((day) => {
        if (!day.meals) return;
        Object.values(day.meals).forEach((meal) => {
          ["staple", "main", "side"].forEach((role) => {
            const dish = meal?.[role];
            if (dish?.name && !seen.has(dish.name)) {
              seen.add(dish.name);
              dishes.push({ name: dish.name, role, desc: dish.desc });
            }
          });
        });
      });
    }

    if (dishes.length === 0) {
      return (
        <div style={styles.tabContent}>
          <div style={styles.emptyState}>
            <div style={styles.emptyEmoji}>📖</div>
            <div style={styles.emptyText}>レシピがまだありません</div>
            <button style={styles.backLink} onClick={() => switchTab("settings")}>献立を生成するとレシピが見られます</button>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.tabContent}>
        <div style={styles.card}>
          <div style={styles.sectionTitle}><span>📖</span> レシピ一覧</div>
          <p style={{ fontSize: 12, color: "#999", margin: "0 0 12px" }}>
            料理名をタップするとレシピを表示します
          </p>

          {dishes.map((dish) => {
            const rc = DISH_ROLES[dish.role];
            const isOpen = openRecipe === dish.name;
            const isLoading = loadingRecipe === dish.name;
            const hasRecipe = !!recipes[dish.name];

            return (
              <div key={dish.name} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => isOpen ? setOpenRecipe(null) : generateRecipe(dish.name)}
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    border: isOpen ? "2px solid #6c5ce7" : "1px solid #eee",
                    borderRadius: 12,
                    background: isOpen ? "#faf8ff" : "#fff",
                    cursor: isLoading ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all 0.2s",
                  }}
                >
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
                    background: rc.bg, color: rc.color, fontWeight: 600,
                  }}>{rc.label}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#2d2d44" }}>{dish.name}</div>
                    {dish.desc && <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{dish.desc}</div>}
                  </div>
                  {isLoading ? (
                    <div style={{ ...styles.spinner, width: 16, height: 16, borderWidth: 2, flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: 12, color: hasRecipe ? "#6c5ce7" : "#ccc", flexShrink: 0 }}>
                      {isOpen ? "▲" : hasRecipe ? "✓ ▼" : "▼"}
                    </span>
                  )}
                </button>

                {isOpen && recipes[dish.name] && (
                  <div style={{
                    padding: "14px 16px",
                    margin: "0 4px",
                    background: "#faf9ff",
                    borderRadius: "0 0 12px 12px",
                    borderLeft: "3px solid #6c5ce7",
                    fontSize: 13,
                    lineHeight: 1.8,
                    color: "#333",
                    whiteSpace: "pre-wrap",
                  }}>
                    {recipes[dish.name]}
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${dish.name}\n\n${recipes[dish.name]}`).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          });
                        }}
                        style={styles.copyButton(copied)}
                      >
                        {copied ? "✓ コピー完了" : "📋 コピー"}
                      </button>
                      <button
                        onClick={() => {
                          setRecipes((prev) => {
                            const next = { ...prev };
                            delete next[dish.name];
                            return next;
                          });
                          setOpenRecipe(null);
                          setTimeout(() => generateRecipe(dish.name), 100);
                        }}
                        style={{
                          padding: "6px 14px", borderRadius: 8, border: "1px solid #eee",
                          background: "#fff", fontSize: 12, cursor: "pointer", color: "#666",
                        }}
                      >
                        🔄 再生成
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <div style={styles.container}>
      <style>{styles.globalStyle}</style>

      <div style={styles.header}>
        <h1 style={styles.headerTitle} className="header-title">
          🍱 こんだてアシスタント
        </h1>
        <div style={styles.headerSub}>
          AIが家族にぴったりの1週間献立を提案します
        </div>
      </div>

      <div style={styles.tabBar} className="tab-bar">
        {[
          { key: "settings", label: "⚙️ 設定" },
          { key: "plan", label: plan?.days ? "📅 献立 ✓" : "📅 献立" },
          { key: "grocery", label: Object.keys(groceryData).some((k) => (groceryData[k] || []).length > 0) ? "🛒 買い物 ✓" : "🛒 買い物" },
          { key: "recipe", label: Object.keys(recipes).length > 0 ? `📖 レシピ (${Object.keys(recipes).length})` : "📖 レシピ" },
        ].map((t) => (
          <button
            key={t.key}
            style={styles.tabButton(tab === t.key)}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && tab !== "settings" && (
        <div style={styles.error}>{error}</div>
      )}

      {tab === "settings" && renderSettings()}
      {tab === "plan" && renderPlan()}
      {tab === "grocery" && renderGrocery()}
      {tab === "recipe" && renderRecipe()}
    </div>
  );
}
