// Pictures into a PDF, for FlickerTalk (Plan §53–§55). One page per picture, the picture kept as
// the JPEG it already is, and the file written here: no library, no network, nothing of the chat.

const A4 = { width: 595, height: 842 };
const MARGIN = 24;

/** Where a picture goes on an A4 page: as big as it fits inside the margin, centred. */
export function a4Box({ width, height }) {
  const room = { width: A4.width - MARGIN * 2, height: A4.height - MARGIN * 2 };
  const scale = Math.min(room.width / width, room.height / height);
  const drawn = { width: width * scale, height: height * scale };
  return {
    page: A4,
    x: (A4.width - drawn.width) / 2,
    y: (A4.height - drawn.height) / 2,
    width: drawn.width,
    height: drawn.height,
  };
}

const ascii = (text) => new TextEncoder().encode(text);

/** The PDF of those pictures, or nothing when there are none. */
export function pdfOf(pages) {
  if (!pages.length) return null;

  const parts = [];
  const offsets = [0];
  let at = 0;
  const put = (bytes) => {
    parts.push(bytes);
    at += bytes.length;
  };
  const object = (number, body, stream) => {
    offsets[number] = at;
    put(ascii(`${number} 0 obj\n${body}\n`));
    if (stream) {
      put(ascii("stream\n"));
      put(stream);
      put(ascii("\nendstream\n"));
    }
    put(ascii("endobj\n"));
  };

  // 1 catalogue, 2 pages, then three objects per page: the page, what is drawn, the picture.
  const first = 3;
  const kids = pages.map((_, index) => `${first + index * 3} 0 R`).join(" ");

  // The second line is the four high bytes every reader looks for to call the file binary.
  put(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  pages.forEach((page, index) => {
    const number = first + index * 3;
    const box = a4Box(page);
    const drawn = ascii(
      `q\n${box.width.toFixed(2)} 0 0 ${box.height.toFixed(2)} ${box.x.toFixed(2)} ${box.y.toFixed(2)} cm\n/Im0 Do\nQ\n`,
    );
    object(
      number,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${box.page.width} ${box.page.height}] ` +
        `/Resources << /XObject << /Im0 ${number + 2} 0 R >> >> /Contents ${number + 1} 0 R >>`,
    );
    object(number + 1, `<< /Length ${drawn.length} >>`, drawn);
    object(
      number + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
  });

  const count = offsets.length;
  const table = [`xref\n0 ${count}\n`, "0000000000 65535 f \n"];
  for (let number = 1; number < count; number += 1) {
    table.push(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }
  const startxref = at;
  put(ascii(table.join("")));
  put(ascii(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`));

  const all = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let written = 0;
  for (const part of parts) {
    all.set(part, written);
    written += part.length;
  }
  return all;
}

/** Bytes as base64, in bites the browser can take. */
export function base64Of(bytes) {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return btoa(binary);
}

const STYLE = `
:host { display: block; font: 14px system-ui, sans-serif; color: #111; }
@media (prefers-color-scheme: dark) { :host { color: #f4f4f4; } }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0 10px; }
button {
  appearance: none; border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 10px; min-width: 44px; height: 40px; font-size: 18px; cursor: pointer; opacity: .75;
}
button:disabled { opacity: .25; }
button.on { opacity: 1; background: currentColor; }
button.on > span { filter: invert(1); }
.grow { flex: 1; }
.note { font-size: 12px; opacity: .6; }
ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
li { display: flex; align-items: center; gap: 8px; }
li img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
li .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** The longest side a page picture keeps: more than this only makes a heavier file. */
const PAGE_PIXELS = 1600;

class ImagesToPdf extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.pages = [];
    this.document = false;
  }

  connectedCallback() {
    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="bar">
        <button data-act="add" aria-label="Add a picture"><span>➕</span></button>
        <button data-act="scan" aria-label="Document: grey and sharp"><span>📄</span></button>
        <span class="grow"></span>
        <button data-act="send" aria-label="Send the PDF" disabled><span>➤</span></button>
      </div>
      <ol></ol>
      <p class="note" hidden></p>
    `;
    this.list = this.root.querySelector("ol");
    this.noteEl = this.root.querySelector(".note");
    this.root.addEventListener("click", (event) => this.onClick(event));
    globalThis.ft?.onOpen(() => {
      if (!this.pages.length) this.add();
    });
  }

  onClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const { act, at } = button.dataset;
    if (act === "add") this.add();
    else if (act === "scan") this.toggleDocument();
    else if (act === "up") this.move(Number(at), -1);
    else if (act === "drop") this.drop(Number(at));
    else if (act === "send") this.send();
  }

  async add() {
    const picked = await globalThis.ft.pickFile("image/*");
    if (!picked) return;
    const image = new Image();
    image.src = `data:${picked.mime || "image/jpeg"};base64,${picked.data}`;
    await image.decode().catch(() => {});
    if (!image.naturalWidth) {
      this.say("😕");
      return;
    }
    this.pages.push({ name: picked.name, image });
    this.show();
  }

  toggleDocument() {
    this.document = !this.document;
    this.show();
  }

  move(at, by) {
    const to = at + by;
    if (to < 0 || to >= this.pages.length) return;
    [this.pages[at], this.pages[to]] = [this.pages[to], this.pages[at]];
    this.show();
  }

  drop(at) {
    this.pages.splice(at, 1);
    this.show();
  }

  show() {
    this.root.querySelector('[data-act="send"]').disabled = !this.pages.length;
    this.root.querySelector('[data-act="scan"]').classList.toggle("on", this.document);
    this.list.innerHTML = "";
    this.pages.forEach((page, at) => {
      const item = document.createElement("li");
      const preview = document.createElement("img");
      preview.src = page.image.src;
      preview.alt = "";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `${at + 1}. ${page.name}`;
      item.append(preview, name, button("up", at, "Move up", "⬆️"), button("drop", at, "Take out", "🗑️"));
      this.list.append(item);
    });
    this.say(this.pages.length ? `${this.pages.length} 📄` : "");
  }

  /** Each picture drawn again: smaller, and grey and sharp when it is a document. */
  jpegOf(page) {
    const size = fitted(page.image, PAGE_PIXELS);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (this.document) context.filter = "grayscale(1) contrast(1.45) brightness(1.08)";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(page.image, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.82);
    return { jpeg: bytesOf(url.slice(url.indexOf(",") + 1)), width: canvas.width, height: canvas.height };
  }

  send() {
    const pages = this.pages.map((page) => this.jpegOf(page)).filter(Boolean);
    const made = pdfOf(pages);
    if (!made) return;
    globalThis.ft.send(`${stamp()}.pdf`, "application/pdf", base64Of(made));
  }

  say(text) {
    this.noteEl.textContent = text;
    this.noteEl.hidden = !text;
  }
}

function button(act, at, label, icon) {
  const made = document.createElement("button");
  made.dataset.act = act;
  made.dataset.at = String(at);
  made.setAttribute("aria-label", label);
  made.textContent = icon;
  return made;
}

function fitted({ naturalWidth, naturalHeight }, max) {
  const longest = Math.max(naturalWidth, naturalHeight);
  if (longest <= max) return { width: naturalWidth, height: naturalHeight };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(naturalWidth * scale)), height: Math.max(1, Math.round(naturalHeight * scale)) };
}

function bytesOf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

/** What the file is called: the day and the time, so two never collide. */
function stamp() {
  const now = new Date();
  const two = (value) => String(value).padStart(2, "0");
  return `document-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

customElements.define("ft-pdf", ImagesToPdf);
