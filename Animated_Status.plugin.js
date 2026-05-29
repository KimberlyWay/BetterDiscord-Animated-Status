/**
 * @name AnimatedStatus
 * @author KimberlyWay, Gemini
 * @description Animate your Discord Status with this BetterDiscord Plugin
 * @version 1.0.0
 * @website https://github.com/KimberlyWay/BetterDiscord-Animated-Status
 */

class AnimatedStatus {
  constructor(meta) {
    this.meta = meta;
    this.kSpacing = "15px";
    this.kMinTimeout = 2900;
    this.cancel = undefined;
  }

  load() {
    this.animation = BdApi.Data.load(this.meta.name, "animation") || [];
    this.timeout = BdApi.Data.load(this.meta.name, "timeout") || this.kMinTimeout;
    this.randomize = BdApi.Data.load(this.meta.name, "randomize") || false;

    const UserStore = BdApi.Webpack.getModule(m => m && typeof m.getCurrentUser === "function");

    this.status = {
      currentUser: UserStore ? UserStore.getCurrentUser() : { premiumType: 0 },
    };
  }

  getAuthToken() {
    let token = null;
    
    // Попытка 1: Через хранилище авторизации (самый современный и надежный метод)
    try {
        const AuthStore = BdApi.Webpack.getStore("AuthenticationStore");
        if (AuthStore && typeof AuthStore.getToken === "function") {
            token = AuthStore.getToken();
        }
    } catch (e) {}

    // Попытка 2: Прямой поиск модуля токена, если первый метод не сработал
    if (!token) {
        try {
            const TokenModule = BdApi.Webpack.getModule(m => m && typeof m.getToken === "function");
            if (TokenModule) token = TokenModule.getToken();
        } catch (e) {}
    }

    return token;
  }

  start() {
    if (this.animation.length === 0) {
      BdApi.UI.showToast(
        "Animated Status: No status set. Go to Settings>Plugins to set a custom animation!",
        { type: "info" }
      );
    } else {
      this.animationLoop();
    }
  }

  stop() {
    if (this.cancel) {
      this.cancel();
    } else if (this.loop !== undefined) {
      clearTimeout(this.loop);
    }
    this.setStatus(null);
  }

  configObjectFromArray(arr) {
    const data = {};
    if (arr[0] !== undefined && arr[0].length > 0) data.text = arr[0];
    if (arr[1] !== undefined && arr[1].length > 0) data.emoji_name = arr[1];
    if (arr[2] !== undefined && arr[2].length > 0) data.emoji_id = arr[2];
    if (arr[3] !== undefined && arr[3].length > 0) data.timeout = parseInt(arr[3]);
    return data;
  }

  async resolveStatusField(text = "") {
    const evalPrefix = "eval ";
    if (!text.startsWith(evalPrefix)) return text;

    try {
      return eval(text.substr(evalPrefix.length));
    } catch (e) {
      BdApi.UI.showToast(e, { type: "error" });
      return "";
    }
  }

  animationLoop(i = 0) {
    i %= this.animation.length;

    let shouldContinue = true;
    this.loop = undefined;
    this.cancel = () => { shouldContinue = false; };

    Promise.all([
      this.resolveStatusField(this.animation[i].text),
      this.resolveStatusField(this.animation[i].emoji_name),
      this.resolveStatusField(this.animation[i].emoji_id)
    ]).then(p => {
      this.setStatus(this.configObjectFromArray(p));
      this.cancel = undefined;

      if (shouldContinue) {
        const timeout = this.animation[i].timeout || this.timeout;
        this.loop = setTimeout(() => {
          if (this.randomize) {
            i += Math.floor(Math.random() * (this.animation.length - 2));
          }
          this.animationLoop(i + 1);
        }, timeout);
      }
    });
  }

  newEditorRow({ text, emoji_name, emoji_id, timeout } = {}) {
    const hbox = GUI.newHBox(this.kSpacing);

    const textWidget = hbox.appendChild(GUI.newInput(text, "Text"));
    textWidget.style.marginRight = this.kSpacing;

    const emojiWidget = hbox.appendChild(GUI.newInput(emoji_name, "👍" + (this.status.currentUser.premiumType ? " / Nitro Name" : "")));
    emojiWidget.style.width = "140px";

    const optNitroIdWidget = hbox.appendChild(GUI.newInput(emoji_id, "Nitro ID"));
    if (!this.status.currentUser.premiumType) optNitroIdWidget.style.display = "none";
    optNitroIdWidget.style.width = "140px";

    const optTimeoutWidget = hbox.appendChild(GUI.newNumericInput(timeout, this.kMinTimeout, "Time"));
    optTimeoutWidget.style.width = "75px";

    hbox.onkeydown = (e) => {
      const activeContainer = document.activeElement.parentNode;
      const activeIndex = Array.from(activeContainer.children).indexOf(document.activeElement);

      const keymaps = {
        "Delete": [
          [[false, true], () => {
            const next = hbox.nextSibling || hbox.previousSibling;
            hbox.parentNode.removeChild(hbox);
          }],
        ],

        "ArrowDown": [
          [[true, true], () => {
            const activeContainer = this.newEditorRow();
            hbox.parentNode.insertBefore(activeContainer, hbox.nextSibling);
          }],
          [[false, true], () => {
            const next = hbox.nextSibling;
            if (next !== undefined) {
              next.replaceWith(hbox);
              hbox.parentNode.insertBefore(next, hbox);
            }
          }],
          [[false, false], () => {
            const activeContainer = hbox.nextSibling;
          }],
        ],

        "ArrowUp": [
          [[true, true], () => {
            const activeContainer = this.newEditorRow();
            hbox.parentNode.insertBefore(activeContainer, hbox);
          }],
          [[false, true], () => {
            const prev = hbox.previousSibling;
            if (prev !== undefined) {
              prev.replaceWith(hbox);
              hbox.parentNode.insertBefore(prev, hbox.nextSibling);
            }
          }],
          [[false, false], () => {
            const activeContainer = hbox.previousSibling;
          }],
        ],
      };

      const letter = keymaps[e.key];
      if (letter === undefined) return;

      for (let i = 0; i < letter.length; i++) {
        if (letter[i][0][0] !== e.ctrlKey || letter[i][0][1] !== e.shiftKey)
          continue;

        letter[i][1]();
        if (activeContainer) activeContainer.children[activeIndex].focus();
        e.preventDefault();
        return;
      }
    };
    return hbox;
  }

  editorFromJSON(json) {
    const out = GUI.newVBox(this.kSpacing);
    for (let i = 0; i < json.length; i++) {
      out.appendChild(this.newEditorRow(json[i]));
    }
    return out;
  }

  jsonFromEditor(editor) {
    return Array.prototype.slice.call(editor.childNodes).map(row => {
      return this.configObjectFromArray(Array.prototype.slice.call(row.childNodes).map(e => e.value));
    });
  }

  getSettingsPanel() {
    const settings = document.createElement("div");
    settings.style.padding = "10px";

    settings.appendChild(GUI.newLabel("Step-Duration (30500: 30.5 seconds, ...), overwritten by individual steps"));
    const timeout = settings.appendChild(GUI.newNumericInput(this.timeout, this.kMinTimeout));
    timeout.style.marginBottom = this.kSpacing;

    settings.appendChild(GUI.newLabel("Animation"));

    const animationContainer = settings.appendChild(document.createElement("div"));
    animationContainer.style.marginBottom = this.kSpacing;

    const edit = animationContainer.appendChild(this.editorFromJSON(this.animation));

    const actions = settings.appendChild(GUI.newHBox());

    const addStep = actions.appendChild(GUI.newButton("+"));
    addStep.title = "Add step to end";
    addStep.onclick = () => edit.appendChild(this.newEditorRow());

    const delStep = actions.appendChild(GUI.newButton("-"));
    delStep.title = "Remove last step";
    delStep.style.marginLeft = this.kSpacing;
    delStep.onclick = () => edit.removeChild(edit.childNodes[edit.childNodes.length - 1]);

    actions.appendChild(GUI.setExpand(document.createElement("div"), 2));

    const save = actions.appendChild(GUI.newButton("Save"));
    save.onclick = () => {
      try {
        BdApi.Data.save(this.meta.name, "randomize", this.randomize);
        BdApi.Data.save(this.meta.name, "timeout", parseInt(timeout.value));
        BdApi.Data.save(this.meta.name, "animation", this.jsonFromEditor(edit));
      } catch (e) {
        BdApi.UI.showToast(e, { type: "error" });
        return;
      }

      BdApi.UI.showToast("Settings were saved!", { type: "success" });

      this.stop();
      this.load();
      this.start();
    };

    return settings;
  }

  setStatus(status) {
    const token = this.getAuthToken();
    
    if (!token) {
       BdApi.UI.showToast("Animated Status: Не удалось автоматически получить токен. Возможно, Discord обновился.", { type: "error" });
       return;
    }

    const req = new XMLHttpRequest();
    req.open("PATCH", "/api/v9/users/@me/settings", true);
    req.setRequestHeader("authorization", token);
    req.setRequestHeader("content-type", "application/json");
    req.onload = () => {
      const err = this.strError(req);
      if (err !== undefined)
        BdApi.UI.showToast(`Animated Status: Error: ${err}`, { type: "error" });
    };
    if (Object.keys(status || {}).length === 0) status = null;
    req.send(JSON.stringify({ custom_status: status }));
  }

  strError(req) {
    if (req.status < 400) return undefined;
    if (req.status === 401) return "Неверный токен авторизации (Invalid AuthToken)";
    if (req.status === 429) return "Discord отклонил запрос. Тайм-аут слишком мал.";

    let json = JSON.parse(req.response);
    for (const s of ["errors", "custom_status", "text", "_errors", 0, "message"])
      if ((json === undefined) || ((json = json[s]) === undefined))
        return `Unknown error ${req.status}. Please report at github.com/toluschr/BetterDiscord-Animated-Status`;

    return json;
  }
}

const GUI = {
  newInput: (text = "", placeholder = "") => {
    const input = document.createElement("input");
    input.className = "bd-select";
    input.style.paddingLeft = "5px";
    input.value = String(text);
    input.placeholder = String(placeholder);
    return input;
  },

  newNumericInput: (text = "", minimum = 0, placeholder = "") => {
    const out = GUI.newInput(text, placeholder);
    out.setAttribute("type", "number");
    out.addEventListener("focusout", () => {
      if (parseInt(out.value) < minimum) {
        out.value = String(minimum);
        BdApi.UI.showToast(`Value must not be lower than ${minimum}`, { type: "error" });
      }
    });
    return out;
  },

  newLabel: (text = "") => {
    const label = document.createElement("h5");
    label.className = "bd-settings-title bd-settings-group-title";
    label.innerText = String(text);
    return label;
  },

  newButton: (text) => {
    const button = document.createElement("button");
    button.className = "bd-button bd-button-color-brand bd-button-filled";
    button.innerText = String(text);
    return button;
  },

  newHBox: (spacing) => {
    const hbox = document.createElement("div");
    hbox.style.display = "flex";
    hbox.style.gap = spacing;
    hbox.style.flexDirection = "row";
    return hbox;
  },

  newVBox: (spacing) => {
    const hbox = document.createElement("div");
    hbox.style.display = "flex";
    hbox.style.gap = spacing;
    hbox.style.flexDirection = "column";
    return hbox;
  },

  setExpand: (element, value) => {
    element.style.flexGrow = value;
    return element;
  },
};

module.exports = AnimatedStatus;