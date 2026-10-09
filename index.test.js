// The plugin's own tests (Plan §53): the PDF is written here, byte by byte, with no library and
// nothing from the network.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { a4Box, base64Of, pdfOf } from "./dist/index.js";
import source from "./dist/index.js?raw";
import manifest from "./module.json";

// The app's languages (plugin-sdk, module.schema.json): English is the top level.
const languages = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];

// The schema counts characters, not UTF-16 units.
const length = (text) => [...text].length;

describe("manifest", () => {
  // PDF is the name of the format: it stays as it is, only the summary is translated.
  it("sums itself up in every language of the app, and keeps its name", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(languages);
    for (const code of languages) {
      const { summary, ...rest } = manifest.locales[code];
      expect(rest, code).toEqual({});
      expect(summary?.trim(), code).toBeTruthy();
      expect(length(summary), code).toBeLessThanOrEqual(200);
    }
  });

  // What it makes goes to the chat through ft.send or ft.say, which the core refuses without the
  // send permission (A2): the manifest has to ask for it, or the main action does nothing.
  it("asks to write in the chat, since it puts its result there", () => {
    expect(source).toMatch(/\bft\??\.(send|say)\(/);
    expect(manifest.permissions.send).toBe("propose");
  });
});

const text = (bytes) => new TextDecoder("latin1").decode(bytes);
/** A tiny thing that stands in for a JPEG: the writer only carries its bytes. */
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

describe("images to PDF", () => {
  it("fits a picture in an A4 page, centred, with a margin", () => {
    const wide = a4Box({ width: 2000, height: 1000 });
    expect(wide.page).toEqual({ width: 595, height: 842 });
    expect(wide.width).toBeCloseTo(595 - 48, 0);
    expect(wide.height).toBeCloseTo((595 - 48) / 2, 0);
    expect(wide.x).toBeCloseTo(24, 0);
    expect(wide.y).toBeCloseTo((842 - wide.height) / 2, 0);

    const tall = a4Box({ width: 1000, height: 2000 });
    expect(tall.height).toBeCloseTo(842 - 48, 0);
    expect(tall.x).toBeGreaterThan(24);
  });

  it("writes a PDF with one page per picture", () => {
    const made = text(pdfOf([{ jpeg, width: 100, height: 50 }, { jpeg, width: 50, height: 100 }]));
    expect(made.startsWith("%PDF-1.4")).toBe(true);
    expect(made).toContain("/Count 2");
    expect(made.match(/\/Type \/Page[^s]/g)).toHaveLength(2);
    expect(made).toContain("/Filter /DCTDecode");
    expect(made.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  // A reader finds the objects through the table: a wrong offset is an unopenable file.
  it("points the table at where each object really is", () => {
    const bytes = pdfOf([{ jpeg, width: 100, height: 50 }]);
    const made = text(bytes);
    const start = Number(made.slice(made.lastIndexOf("startxref")).split("\n")[1]);
    expect(made.slice(start, start + 4)).toBe("xref");

    const table = made.slice(start).split("\n").slice(2);
    const objects = Number(made.slice(start).split("\n")[1].split(" ")[1]);
    for (let object = 1; object < objects; object += 1) {
      const offset = Number(table[object].slice(0, 10));
      expect(made.slice(offset, offset + `${object} 0 obj`.length)).toBe(`${object} 0 obj`);
    }
  });

  it("keeps the bytes of the picture as they were", () => {
    const bytes = pdfOf([{ jpeg, width: 4, height: 4 }]);
    const made = text(bytes);
    const at = made.indexOf("stream", made.indexOf("/DCTDecode")) + "stream\n".length;
    expect(Array.from(bytes.slice(at, at + jpeg.length))).toEqual(Array.from(jpeg));
  });

  it("is nothing at all without pictures", () => {
    expect(pdfOf([])).toBe(null);
  });

  it("turns bytes into base64 the app can carry", () => {
    expect(base64Of(new Uint8Array([65, 66, 67]))).toBe("QUJD");
    const long = new Uint8Array(200_000).map((_, index) => index % 251);
    expect(atob(base64Of(long)).length).toBe(long.length);
  });

  it("is a custom element the frame can show", () => {
    expect(customElements.get("ft-pdf")).toBeTruthy();
  });
});

describe("with the Ionic the app lends", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  // Ionic moves a button's label to the native button inside it once it has drawn.
  const label = (button) => button.getAttribute("aria-label") ?? button.shadowRoot?.querySelector("button")?.getAttribute("aria-label");
  let asked = 0;
  const mount = async () => {
    asked = 0;
    globalThis.ft = { onOpen() {}, pickFile: async () => ((asked += 1), null) };
    document.body.innerHTML = "";
    const element = document.createElement("ft-pdf");
    document.body.append(element);
    await tick();
    return element;
  };
  const page = (element) => {
    element.pages = [{ name: "a.jpg", image: { src: "data:image/jpeg;base64,AA==" } }, { name: "b.jpg", image: { src: "data:image/jpeg;base64,AA==" } }];
    element.show();
  };

  afterEach(() => {
    delete globalThis.Ionicons;
    delete globalThis.ft;
  });

  // Only an app that lends Ionic can show it (app 1.6.0): an older one keeps the version it has.
  it("asks for an app that lends Ionic", () => {
    expect(manifest.minCoreVersion).toBe("1.6.0");
  });

  it("draws in the page, not in a shadow root, so Ionic's own styles reach it", async () => {
    const element = await mount();
    expect(element.shadowRoot).toBe(null);
    expect(element.querySelector(":scope > ion-header > ion-toolbar")).toBeTruthy();
    expect(element.querySelector(":scope > ion-content ol")).toBeTruthy();
    expect(element.querySelector(":scope > ion-content .note")).toBeTruthy();
  });

  it("has every action as an Ionic button in its toolbar, each with a label", async () => {
    const element = await mount();
    const acts = [...element.querySelectorAll("ion-toolbar ion-button")].map((button) => button.dataset.act);
    expect(acts).toEqual(["add", "scan", "send"]);
    for (const button of element.querySelectorAll("ion-toolbar ion-button")) expect(label(button), button.dataset.act).toBeTruthy();
    expect(element.querySelector("button")).toBe(null);
  });

  it("asks the app for a picture from its button, and can send nothing until there is one", async () => {
    const element = await mount();
    expect(element.querySelector('ion-button[data-act="send"]').disabled).toBe(true);
    element.querySelector('ion-button[data-act="add"]').click();
    await tick();
    expect(asked).toBe(1);
  });

  it("shows document mode as a pressed button", async () => {
    const element = await mount();
    const scan = element.querySelector('ion-button[data-act="scan"]');
    // Ionic hands aria-pressed to its native button, and follows it when it changes.
    const pressed = () => scan.getAttribute("aria-pressed") ?? scan.shadowRoot?.querySelector("button")?.getAttribute("aria-pressed");
    expect(pressed()).toBe("false");
    scan.click();
    await tick();
    expect(pressed()).toBe("true");
    expect(scan.fill).toBe("solid");
    scan.click();
    await tick();
    expect(pressed()).toBe("false");
    expect(scan.fill).toBe(undefined);
  });

  it("moves and takes out a page with the Ionic buttons of its row", async () => {
    const element = await mount();
    page(element);
    expect(element.querySelector('ion-button[data-act="send"]').disabled).toBe(false);
    const rows = () => [...element.querySelectorAll("ol li .name")].map((name) => name.textContent);
    expect(rows()).toEqual(["1. a.jpg", "2. b.jpg"]);
    const row = element.querySelectorAll("ol li")[1];
    for (const button of row.querySelectorAll("ion-button")) expect(label(button), button.dataset.act).toBeTruthy();
    row.querySelector('ion-button[data-act="up"]').click();
    expect(rows()).toEqual(["1. b.jpg", "2. a.jpg"]);
    element.querySelectorAll("ol li")[0].querySelector('ion-button[data-act="drop"]').click();
    expect(rows()).toEqual(["1. a.jpg"]);
    expect(element.querySelector(".note").textContent).toBe("1 page");
  });

  // The icons are the app's: Ionic's own when the app lent them by name, else the ones it serves.
  it("draws an Ionicon the app lent by name with ion-icon, and the one it serves otherwise", async () => {
    let element = await mount();
    expect(element.querySelector('[data-act="add"] ion-icon')).toBe(null);
    expect(element.querySelector('[data-act="add"] [slot="icon-only"]').getAttribute("style")).toContain("./icon/add-outline.svg");

    globalThis.Ionicons = { map: new Map([["add-outline", "data:image/svg+xml;utf8,<svg></svg>"]]) };
    element = await mount();
    expect(element.querySelector('[data-act="add"] ion-icon[slot="icon-only"]').getAttribute("name")).toBe("add-outline");
  });
});

describe("the package", () => {
  const dist = join(import.meta.dirname, "dist");
  const files = readdirSync(dist);

  // Ionic is the app's, lent to the frame: a copy in the package would be a second one, and heavy.
  it("carries no Ionic of its own", () => {
    for (const file of files) {
      const code = readFileSync(join(dist, file), "utf8");
      expect(code, file).not.toMatch(/@ionic\/core|ionicframework|stencil|defineCustomElement|__registerHost/i);
      expect(code, file).not.toMatch(/^\s*import\s.*from\s+["'](?!\.\/)/m);
    }
  });

  // The app carries it as a seed on iOS: 128 KiB at most (plugin-sdk).
  it("is small enough to be a seed", () => {
    const bytes = files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(128 * 1024);
  });
});

describe("the image of the Apps grid", () => {
  // icon.svg beside module.json and dist/, signed with the rest: the app draws it on the tile; the
  // Ionicon in module.json stays as the fallback (2026-10-08).
  const image = join(import.meta.dirname, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(existsSync(join(import.meta.dirname, "dist", "icon.svg"))).toBe(false);
  });
});
