// The Latin spellings search accepts for letters that plain accent stripping can't reach (FR-12.5, TON-201): Latin
// letters with no accent-free form (ø, ł, þ), spelled-out forms (ä as "ae", å as "aa"), and the Cyrillic and Greek
// alphabets. The first spelling is the letter's key, stored and compared; the others are what people also type.
// A letter with no spelling here keeps searchKey's treatment. Chinese, Japanese and Korean stay as written: their
// romanization is ambiguous (decided with the creator, 11 November 2026). Keys are lower case, one code point each,
// precomposed: "й" and "ё" must be looked up before decomposition turns them into "и" and "е".

const table: Record<string, string> = {
  // Latin letters with no accent-free form, and spelled-out umlauts and å.
  ä: "a ae",
  ö: "o oe",
  ü: "u ue",
  å: "a aa",
  ø: "o oe",
  æ: "ae",
  œ: "oe",
  ł: "l",
  đ: "d dj",
  ð: "d",
  þ: "th",
  ħ: "h",
  ŋ: "ng",
  ı: "i",
  ŧ: "t",

  // Cyrillic: Russian, Ukrainian, Belarusian, Serbian, Macedonian and Bulgarian. The soft and hard signs are dropped.
  а: "a",
  б: "b",
  в: "v",
  г: "g h",
  ґ: "g",
  д: "d",
  ђ: "d dj",
  ѓ: "g gj",
  е: "e ye je",
  ё: "e yo jo io",
  є: "ye ie je e",
  ж: "zh j",
  з: "z",
  ѕ: "dz",
  и: "i y",
  і: "i",
  ї: "yi i ji",
  й: "y i j",
  ј: "j",
  к: "k",
  ќ: "k kj",
  л: "l",
  љ: "lj",
  м: "m",
  н: "n",
  њ: "nj",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  ћ: "c ch",
  у: "u",
  ў: "u w",
  ф: "f",
  х: "kh h x",
  ц: "ts c tz",
  ч: "ch",
  џ: "dz",
  ш: "sh",
  щ: "shch sch sht",
  ъ: "",
  ы: "y i",
  ь: "",
  э: "e",
  ю: "yu ju iu",
  я: "ya ja ia a",

  // Greek, after its accents are stripped; final sigma folds to σ.
  α: "a",
  β: "v b",
  γ: "g n y",
  δ: "d dh",
  ε: "e",
  ζ: "z",
  η: "i e",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x ks",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  τ: "t",
  υ: "y u i v f",
  φ: "f ph",
  χ: "ch h kh x",
  ψ: "ps",
  ω: "o",
};

/** Each letter's spellings, its key first; an empty list for a letter search drops. */
export const latinSpellings: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(table).map(([letter, spellings]) => [
    letter,
    spellings === "" ? [] : spellings.split(" "),
  ]),
);

/** Every spelling that isn't a letter's key: the parts of a query that may stand for a different key. */
export const otherSpellings: readonly string[] = [
  ...new Set([...latinSpellings.values()].flatMap((spellings) => spellings.slice(1))),
];
