import { execFileSync } from "node:child_process";
let cached;
export function systemLang() {
    if (cached)
        return cached;
    let tag = "";
    try {
        if (process.platform === "darwin")
            tag = execFileSync("defaults", ["read", "-g", "AppleLocale"], { timeout: 3000 }).toString().trim();
        else if (process.platform === "win32")
            tag = execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-Culture).Name"], { timeout: 5000 }).toString().trim();
    }
    catch { /* fall back to env */ }
    if (!tag)
        tag = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "en";
    const code = tag.slice(0, 2).toLowerCase();
    cached = ["en", "ru", "de", "fr", "es", "ja"].includes(code) ? code : "en";
    return cached;
}
const T = {
    en: { allow: "Allow", deny: "Don't allow", title: "Desktop Steward",
        del: (n, s, d) => `Delete ${n} item${n === 1 ? "" : "s"}? ${s}. Kept for ${d} days and can be undone.`,
        replace: (f) => `Replace the existing file ${f}? The old version is kept for undo.`,
        move: (n, a, b) => `Move or rename ${n} items? For example ${a} → ${b}. This can be undone.` },
    ru: { allow: "Разрешить", deny: "Не разрешать", title: "Desktop Steward",
        del: (n, s, d) => `Удалить ${n} ${n === 1 ? "объект" : n < 5 ? "объекта" : "объектов"}? ${s}. Хранится ${d} дней, можно отменить.`,
        replace: (f) => `Заменить существующий файл ${f}? Старая версия сохранится для отмены.`,
        move: (n, a, b) => `Переместить или переименовать ${n} объектов? Например ${a} → ${b}. Это можно отменить.` },
    de: { allow: "Erlauben", deny: "Nicht erlauben", title: "Desktop Steward",
        del: (n, s, d) => `${n} Element${n === 1 ? "" : "e"} löschen? ${s}. Wird ${d} Tage aufbewahrt und kann rückgängig gemacht werden.`,
        replace: (f) => `Vorhandene Datei ${f} ersetzen? Die alte Version bleibt zum Rückgängigmachen erhalten.`,
        move: (n, a, b) => `${n} Elemente verschieben oder umbenennen? Zum Beispiel ${a} → ${b}. Kann rückgängig gemacht werden.` },
    fr: { allow: "Autoriser", deny: "Ne pas autoriser", title: "Desktop Steward",
        del: (n, s, d) => `Supprimer ${n} élément${n === 1 ? "" : "s"} ? ${s}. Conservé ${d} jours, annulable.`,
        replace: (f) => `Remplacer le fichier existant ${f} ? L'ancienne version est conservée pour annulation.`,
        move: (n, a, b) => `Déplacer ou renommer ${n} éléments ? Par exemple ${a} → ${b}. Annulable.` },
    es: { allow: "Permitir", deny: "No permitir", title: "Desktop Steward",
        del: (n, s, d) => `¿Eliminar ${n} elemento${n === 1 ? "" : "s"}? ${s}. Se guarda ${d} días y se puede deshacer.`,
        replace: (f) => `¿Reemplazar el archivo existente ${f}? La versión anterior se guarda para deshacer.`,
        move: (n, a, b) => `¿Mover o renombrar ${n} elementos? Por ejemplo ${a} → ${b}. Se puede deshacer.` },
    ja: { allow: "許可", deny: "許可しない", title: "Desktop Steward",
        del: (n, s, d) => `${n}件を削除しますか？ ${s}。${d}日間保管され、元に戻せます。`,
        replace: (f) => `既存のファイル ${f} を置き換えますか？ 元のバージョンは保管されます。`,
        move: (n, a, b) => `${n}件を移動または名前変更しますか？ 例: ${a} → ${b}。元に戻せます。` },
};
export function t() {
    return T[systemLang()];
}
//# sourceMappingURL=i18n.js.map