import { createContext, useContext, useState } from "react";
import { t as translate, LANGUAGES } from "./translations.js";

const LangCtx = createContext({ lang: "ko", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem("hh_lang");
    return LANGUAGES.find(l => l.code === saved) ? saved : "ko";
  });

  const setLangAndSave = (code) => {
    localStorage.setItem("hh_lang", code);
    setLang(code);
  };

  const t = (key) => translate(key, lang);

  return (
    <LangCtx.Provider value={{ lang, setLang: setLangAndSave, t, LANGUAGES }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useLang() {
  return useContext(LangCtx);
}
