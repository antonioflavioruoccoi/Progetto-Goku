// Nickname safety filter, switchable per room (room.name_filter).
// The name is normalized (accents, look-alike letters, digits used as letters,
// separators, repeated letters) and then searched for banned roots anywhere
// inside it, so "D10C4N3" and "porcodiddioladromerda" are caught too.

const homoglyphs = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "у": "y", "к": "k", "м": "m", "т": "t", "в": "b", "н": "h" };
const leet = { 0: "o", 1: "i", 2: "z", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g" };

// Each entry: banned root, allowed words that contain it, and `true` when the
// root has double letters that must stay double (e.g. "tette" vs "potete").
const banned = [
  // Blasfemia
  ["diocan"], ["dioporc"], ["diobest"], ["diomerd"], ["dioboi"], ["diostronz"], ["diomaial"], ["dioladr"],
  ["diocagn"], ["diobastard"], ["dioserpent"], ["diolup"], ["dioimpest"], ["porcodi"], ["porcoddi"],
  ["canedio"], ["madonnaputt"], ["madonnatroi"], ["madonnamaial"], ["madonnacagn"], ["porcamadon"],
  ["madonnaimpest"], ["madonnalad"], ["porcocrist"], ["cristoporc"], ["dioschifo"], ["ziocan"], ["porcozio"],
  // Sessualità e volgarità
  ["sborr", ["sborni"]], ["cazz"], ["minchi"], ["pompin"], ["porno"], ["troia"], ["puttan"], ["zoccol"], ["mignott"],
  ["inculat"], ["culo", ["iculo", "rculo", "oculo", "nculo"]], ["tette", [], true], ["vagin"], ["pene", ["penelop", "serpene", "spene"]],
  ["figa", ["figat", "figaro"]], ["fica", ["ifica", "ificaz"]], ["dildo"], ["orgasm"], ["masturb"], ["segaiol"], ["sesso", [], true],
  ["sex", ["essex", "sext"]], ["fuck"], ["dick", ["dicken"]], ["pussy"], ["cock", ["cockpit", "hancock", "peacock"]],
  ["whore"], ["slut"], ["cunt"], ["bitch"], ["pedofil"], ["pedophil"], ["stupr"],
  // Insulti e omofobia
  ["froci"], ["frosc"], ["ricchion"], ["culatton"], ["finocch"], ["faggot"], ["stronz"], ["merda"], ["coglion"],
  ["bastard"], ["vaffancul"], ["fancul"], ["handicappat"], ["mongolo"], ["ritardat"], ["retard"], ["shit"], ["asshole"],
  // Razzismo
  ["negr", ["montenegr", "negroni", "negroamar"]], ["nigger", [], true], ["nigga", [], true], ["negher"], ["zingar"], ["terron"],
  ["polenton"], ["musogiall"], ["kike"], ["chink"], ["whitepower"], ["whitepride"], ["kukluxklan"],
  // Violenza e terrorismo
  ["uccid", [], true], ["ammazz", [], true], ["sgozz"], ["decapit"], ["massacr"], ["strage"], ["terrorist"], ["jihad"], ["isis", ["crisis", "risis"]],
  ["kill", ["skill"], true], ["suicid"], ["olocaust"], ["auschwitz"],
  // Nazismo, fascismo, comunismo e figure storiche controverse
  ["duce", ["produce", "riduce", "conduce", "seduce", "traduce", "induce", "deduce", "introduce", "adduce", "reduce", "educe"]],
  ["mussolin"], ["hitler"], ["hitl"], ["fuhrer"], ["fuehrer"], ["nazi", ["nazio", "nazir"]], ["nazis"], ["fascis"],
  ["fascio"], ["siegheil"], ["heilhitler"], ["svastic"], ["swastik"], ["himmler"], ["goebbels"], ["mengele"],
  ["eichmann"], ["stalin"], ["lenin"], ["comunis"], ["communis"], ["maozedong"], ["maotsetung"], ["polpot"],
  ["pinochet"], ["binladen"], ["mafios"], ["camorr"], ["ndranghet"], ["riina", [], true], ["provenzan"],
];

// Same steps for the banned list and the nickname.
function squeeze(text) {
  return text.replace(/(.)\1+/g, "$1");
}

function variants(raw) {
  const base = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/./g, ch => homoglyphs[ch] ?? ch);
  const forms = new Set();
  for (const one of ["i", "l"]) {
    const text = base.replace(/[0-9]/g, d => (d === "1" ? one : leet[d])).replace(/[^a-z]/g, "");
    forms.add(text);
    forms.add(text.replace(/k/g, "c").replace(/[yj]/g, "i").replace(/ph/g, "f").replace(/w/g, "v"));
    forms.add(text.replace(/x/g, "cs"));
  }
  return [...forms].map(plain => ({ plain, squeezed: squeeze(plain) }));
}

const rules = banned.map(([root, allow = [], raw = false]) => ({
  raw,
  root: raw ? root : squeeze(root),
  allow: raw ? allow : allow.map(squeeze),
}));
const digitRules = [/14\W*88/, /k\W*k\W*k/i];

export function inappropriateName(nickname) {
  const name = String(nickname ?? "");
  if (digitRules.some(rule => rule.test(name))) return true;
  return variants(name).some(form => rules.some(({ raw, root, allow }) => {
    const text = raw ? form.plain : form.squeezed;
    if (!text.includes(root)) return false;
    // Hide the allowed words, then look again.
    let rest = text;
    for (const word of allow) rest = rest.split(word).join("#");
    return rest.includes(root);
  }));
}
