// The viewer's own texts in the app's language: the app opens index.html with ?lang=zh-Hant or ?lang=zh-Hans (the
// web app may pass the same). tr('Edit chords') gives the translation, the English text itself when there is none;
// tr('Bar {0}', 12) fills in the numbers. Elements of index.html with data-tr (text) or data-tr-label (aria-label)
// are translated here at the start. The sheet itself (titles, lyrics, the capo line) follows the hymn, not this.
(function () {
  'use strict';
  var HANT = {
    'Sheet music': '樂譜',
    'Back': '返回',
    'Piano': '鋼琴',
    'Guitar': '吉他',
    'Transpose down': '降調',
    'Transpose up': '升調',
    'Light or dark paper': '淺色或深色紙',
    'Light paper': '淺色紙',
    'Dark paper': '深色紙',
    'Staff': '五線譜',
    'Show staff': '顯示五線譜',
    'Hide staff': '隱藏五線譜',
    'Edit chords': '編輯和弦',
    'Editing chords': '正在編輯和弦',
    'Original chords': '原來的和弦',
    'Loading…': '載入中…',
    'Could not render this sheet: {0}': '無法顯示這份樂譜：{0}',
    'Sheet music not found ({0})': '找不到樂譜（{0}）',
    'Chord editor': '和弦編輯器',
    'Undo': '復原',
    'Original bar': '原來的小節',
    'Done': '完成',
    'Previous bar': '上一小節',
    'Next bar': '下一小節',
    'Beats': '拍子',
    'Chord': '和弦',
    'Remove chord': '刪除和弦',
    'Bass': '低音',
    'none': '無',
    'Bar {0}': '第 {0} 小節',
    'Tap a bar on the sheet': '點選樂譜上的一個小節',
    'Type a chord for beat {0}': '輸入第 {0} 拍的和弦',
    'Saved on this device ✓': '已存在這台裝置 ✓',
    'Not saved, trying again…': '尚未儲存，正在重試…',
    'The sheet has changed since you edited bar {0}. Check that bar.': '你編輯第 {0} 小節之後，樂譜已經改變。請檢查那一小節。',
    'The sheet has changed since you edited bars {0}. Check those bars.': '你編輯第 {0} 小節之後，樂譜已經改變。請檢查那些小節。'
  };
  var HANS = {
    'Sheet music': '乐谱',
    'Back': '返回',
    'Piano': '钢琴',
    'Guitar': '吉他',
    'Transpose down': '降调',
    'Transpose up': '升调',
    'Light or dark paper': '浅色或深色纸',
    'Light paper': '浅色纸',
    'Dark paper': '深色纸',
    'Staff': '五线谱',
    'Show staff': '显示五线谱',
    'Hide staff': '隐藏五线谱',
    'Edit chords': '编辑和弦',
    'Editing chords': '正在编辑和弦',
    'Original chords': '原来的和弦',
    'Loading…': '加载中…',
    'Could not render this sheet: {0}': '无法显示这份乐谱：{0}',
    'Sheet music not found ({0})': '找不到乐谱（{0}）',
    'Chord editor': '和弦编辑器',
    'Undo': '撤销',
    'Original bar': '原来的小节',
    'Done': '完成',
    'Previous bar': '上一小节',
    'Next bar': '下一小节',
    'Beats': '拍子',
    'Chord': '和弦',
    'Remove chord': '删除和弦',
    'Bass': '低音',
    'none': '无',
    'Bar {0}': '第 {0} 小节',
    'Tap a bar on the sheet': '点选乐谱上的一个小节',
    'Type a chord for beat {0}': '输入第 {0} 拍的和弦',
    'Saved on this device ✓': '已保存在这台设备 ✓',
    'Not saved, trying again…': '尚未保存，正在重试…',
    'The sheet has changed since you edited bar {0}. Check that bar.': '你编辑第 {0} 小节之后，乐谱已经改变。请检查那一小节。',
    'The sheet has changed since you edited bars {0}. Check those bars.': '你编辑第 {0} 小节之后，乐谱已经改变。请检查那些小节。'
  };

  var lang = '';
  try { lang = new URLSearchParams(location.search).get('lang') || ''; } catch (e) { /* no query: English */ }
  var table = /^zh-(Hant|TW|HK|MO)\b/i.test(lang) ? HANT : /^zh\b/i.test(lang) ? HANS : {};

  window.tr = function (english) {
    var text = table.hasOwnProperty(english) ? table[english] : english;
    for (var i = 1; i < arguments.length; i++) text = text.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return text;
  };

  function translatePage() {
    if (table !== HANT && table !== HANS) return;
    document.documentElement.lang = table === HANT ? 'zh-Hant' : 'zh-Hans';
    document.title = window.tr(document.title);
    Array.prototype.forEach.call(document.querySelectorAll('[data-tr]'), function (e) {
      e.textContent = window.tr(e.textContent.trim());
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tr-label]'), function (e) {
      e.setAttribute('aria-label', window.tr(e.getAttribute('aria-label')));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', translatePage);
  else translatePage();
})();
