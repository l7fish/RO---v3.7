// ==UserScript==
// @name         RO放置仙境 - 全能掛機與倉庫販售助手
// @namespace    https://github.com/l7fish/RO---v3.7
// @version      3.7
// @description  僅顯示【不處理】掉落物、藥水與補給下方同步可消耗品/翅膀/箭矢設定、背包快選與回村存賣
// @license      MIT
// @match        *://ro-idle.app/*
// @updateURL    https://raw.githubusercontent.com/l7fish/RO---v3.7/main/ro-idle-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/l7fish/RO---v3.7/main/ro-idle-helper.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DELAY_MS = 150;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const PRECIOUS_KEYWORDS = [
        '卡片', '鋁', '神之金屬', '天地樹', '黃金', '鑽石', '藍寶石', '紫寶石', '紅寶石',
        '黃寶石', '綠寶石', '珍珠', '蛋白石', '水晶鏡子', '華麗金屬', '神秘箱子',
        '老舊收集冊', '老舊紫箱', '卡片冊', '染料', '鑰匙'
    ];

    const EQUIP_KEYWORDS = [
        '[0]', '[1]', '[2]', '[3]', '[4]', '劍', '弓', '杖', '斧', '矛', '拳刃', '短劍',
        '鈍器', '書', '鞭', '樂器', '盾', '甲', '外套', '袍', '靴', '鞋', '披肩', '斗篷',
        '頭盔', '帽', '眼鏡', '面具', '耳環', '戒指', '項鍊', '珠鏈', '髮夾', '手套', '發帶', '髮帶'
    ];

    // 建立元素小工具
    function el(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(props).forEach(([k, v]) => {
            if (k === 'style') node.style.cssText = v;
            else if (k.startsWith('on')) node[k] = v;
            else if (k in node) node[k] = v;
            else node.setAttribute(k, v);
        });
        children.forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return node;
    }

    // 讓 React 受控元件正確吃進數值
    function setReactVal(target, val) {
        const proto = target.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, val);
        if (target.tagName !== 'SELECT') target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const isUnsetSelect = (sel) => {
        if (!sel) return false;
        const txt = sel.options[sel.selectedIndex]?.text.trim() || '';
        return !sel.value || sel.value === 'none' || txt.includes('不使用') || txt.includes('不自動');
    };

    const runAllInjects = () => {
        injectBadge();
        injectReturnBtn();
        injectBagTools();
        injectMapDropPanel();
        injectPotionPanel();
    };

    new MutationObserver(runAllInjects).observe(document.body, { childList: true, subtree: true });
    setTimeout(runAllInjects, 800);

    function injectBadge() {
        if ($('#ro-helper-badge')) return;
        document.body.appendChild(el('div', {
            id: 'ro-helper-badge',
            textContent: 'RO助手 v3.7',
            style: 'position:fixed;bottom:28px;right:8px;z-index:9999;background:rgba(0,85,170,.85);color:#fff;font-size:11px;padding:2px 6px;border-radius:3px;pointer-events:none;'
        }));
    }

    // 【功能 1】主控台「🦋 回村存倉」
    function injectReturnBtn() {
        if ($('#ro-btn-butterfly-store')) return;
        const anchor = $$('button').find((b) => b.textContent.trim() === '回儲存點');
        if (!anchor) return;

        const btn = el('button', {
            id: 'ro-btn-butterfly-store',
            type: 'button',
            className: 'xp-btn small',
            textContent: '🦋 回村存倉',
            style: 'margin-right:4px;color:#0055aa;font-weight:bold;',
            onclick: async () => {
                const orig = btn.textContent;
                btn.disabled = true;
                try {
                    $$('button.xp-menu-item').find((b) => b.textContent.trim() === '背包')?.click();
                    await sleep(300);
                    $$('button[role="tab"]').find((b) => b.textContent.trim() === '全部')?.click();
                    await sleep(200);

                    const wingRow = $$('table.xp-table tbody tr').find((r) => r.textContent.includes('蝴蝶翅膀'));
                    if (!wingRow) return alert('背包內找不到「蝴蝶翅膀」！');

                    (wingRow.querySelector('td:nth-child(2) button') || wingRow.querySelector('button'))?.click();
                    await sleep(250);
                    const useBtn = $$('button.xp-btn').find((b) => b.textContent.trim() === '使用');
                    if (useBtn && !useBtn.disabled) { useBtn.click(); await sleep(600); }

                    await executeStoreAndSellAll();
                    alert('已使用蝴蝶翅膀回村並完成存倉與販售！');
                } finally {
                    btn.disabled = false;
                    btn.textContent = orig;
                }
            }
        });
        anchor.parentElement.insertBefore(btn, anchor);
    }

    // 【功能 2 & 3】背包快選設定 & 執行存倉販售
    function injectBagTools() {
        const searchInput = $('input[placeholder*="搜尋物品名稱"]');
        if (!searchInput) return;

        if (!$('#ro-btn-quick-config')) {
            searchInput.parentElement.appendChild(el('button', {
                id: 'ro-btn-quick-config',
                type: 'button',
                className: 'xp-btn small',
                textContent: '⚡ 快速設定賣出/存倉',
                style: 'margin-left:6px;color:#0055aa;font-weight:bold;',
                onclick: openBagModal
            }));
        }

        if (!$('#ro-btn-exec-store-sell')) {
            const anchor = $$('button.xp-btn').find((b) => b.textContent.includes('賣出勾選') || b.textContent.includes('多選'));
            anchor?.parentElement.appendChild(el('button', {
                id: 'ro-btn-exec-store-sell',
                type: 'button',
                className: 'xp-btn small',
                textContent: '📦 執行存倉以及販售',
                style: 'margin-left:6px;color:#006622;font-weight:bold;',
                onclick: async function () {
                    this.disabled = true;
                    const old = this.textContent;
                    this.textContent = '執行中...';
                    await executeStoreAndSellAll();
                    this.disabled = false;
                    this.textContent = old;
                }
            }));
        }
    }

    function openBagModal() {
        $('#ro-quick-modal-overlay')?.remove();
        const table = $('table.xp-table');
        if (!table) return alert('請先切換到背包列表畫面！');

        const items = $$('tbody tr', table).map((row) => {
            const cells = $$('td', row);
            if (cells.length < 6) return null;
            const off = cells[0].querySelector('input[type="checkbox"]') ? 1 : 0;
            const nameBtn = cells[off]?.querySelector('button');
            if (!nameBtn) return null;
            return {
                name: nameBtn.textContent.trim(),
                status: cells[off + 1]?.textContent.trim() || cells[off + 2]?.textContent.trim() || '未設定',
                count: cells[off + 3]?.textContent.trim() || '',
                category: cells[off + 5]?.textContent.trim() || '',
                nameBtn
            };
        }).filter(Boolean);

        const overlay = el('div', {
            id: 'ro-quick-modal-overlay',
            style: 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;'
        });

        const listBox = el('div', { style: 'flex:1;overflow-y:auto;padding:6px;background:#fff;margin:6px;border:1px inset #808080;max-height:380px;' });
        const cbs = items.map((it) => {
            const cb = el('input', { type: 'checkbox', style: 'margin-right:6px;' });
            const isCard = it.name.includes('卡片');
            listBox.appendChild(el('label', {
                style: 'display:flex;align-items:center;padding:3px 4px;border-bottom:1px solid #eee;cursor:pointer;font-size:12px;color:#000;'
            }, [
                cb,
                el('span', { textContent: `${it.name} (x${it.count})`, style: `flex:1;font-weight:${isCard ? 'bold' : 'normal'};color:${isCard ? '#d00' : '#000'};` }),
                el('span', { textContent: `[${it.category}]`, style: 'width:55px;color:#555;' }),
                el('span', { textContent: it.status, style: 'width:70px;text-align:right;color:#0066cc;' })
            ]));
            return cb;
        });

        const applyMode = async (mode) => {
            const picked = items.filter((_, i) => cbs[i].checked);
            if (!picked.length) return alert('請先勾選物品！');
            overlay.remove();
            for (const it of picked) {
                it.nameBtn.click();
                await sleep(DELAY_MS);
                const radios = $$('input[type="radio"][name^="bag-town-"]');
                if (radios[mode] && !radios[mode].checked) { radios[mode].click(); await sleep(DELAY_MS); }
            }
            alert(`設定完成！共設定 ${picked.length} 項。`);
        };

        const modal = el('div', {
            className: 'xp-window',
            style: 'width:540px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;background:#ece9d8;border:2px solid #0054e3;'
        }, [
            el('div', { style: 'background:#0058e6;color:#fff;padding:4px 8px;font-weight:bold;display:flex;justify-content:space-between;' }, [
                el('span', { textContent: '⚡ 背包物品快選設定' }),
                el('button', { className: 'xp-btn small', textContent: '✕', style: 'color:#000;', onclick: () => overlay.remove() })
            ]),
            el('div', { style: 'padding:8px;display:flex;flex-wrap:wrap;gap:6px;background:#f5f4ea;' }, [
                el('button', { className: 'xp-btn small', textContent: '全選', onclick: () => cbs.forEach((c) => c.checked = true) }),
                el('button', { className: 'xp-btn small', textContent: '全不選', onclick: () => cbs.forEach((c) => c.checked = false) }),
                el('button', {
                    className: 'xp-btn small', textContent: '快選雜物', style: 'color:#b22222;',
                    onclick: () => items.forEach((it, i) => cbs[i].checked =
                        !['裝備', '卡片', '消耗品', '箭矢'].includes(it.category) &&
                        !PRECIOUS_KEYWORDS.some((k) => it.name.includes(k)) &&
                        !it.name.includes('🔒') && !it.name.includes('[E]'))
                }),
                el('button', {
                    className: 'xp-btn small', textContent: '快選卡片+裝備', style: 'color:#800080;font-weight:bold;',
                    onclick: () => items.forEach((it, i) => {
                        const locked = it.name.includes('🔒') || it.name.includes('[E]');
                        cbs[i].checked = it.category === '卡片' || it.name.includes('卡片') || (it.category === '裝備' && !locked);
                    })
                })
            ]),
            listBox,
            el('div', { style: 'padding:8px;display:flex;justify-content:flex-end;gap:8px;' }, [
                el('button', { className: 'xp-btn', textContent: '設為【存倉】', style: 'color:#0055aa;font-weight:bold;', onclick: () => applyMode(2) }),
                el('button', { className: 'xp-btn', textContent: '設為【賣出】', style: 'color:#b22222;font-weight:bold;', onclick: () => applyMode(1) }),
                el('button', { className: 'xp-btn', textContent: '取消', onclick: () => overlay.remove() })
            ])
        ]);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    async function executeStoreAndSellAll() {
        for (const [tabName, keywords] of [['倉庫', ['依設定', '自動存']], ['商店', ['依設定', '賣出設定']]]) {
            const tab = $$('button.xp-menu-item').find((b) => b.textContent.trim() === tabName);
            if (!tab) continue;
            tab.click();
            await sleep(350);
            const btn = $$('button.xp-btn').find((b) => keywords.some((k) => b.textContent.includes(k)) && !b.disabled);
            if (btn) { btn.click(); await sleep(350); }
        }
    }

    async function ensureItemListLoaded() {
        let rangeGroup = $('span[aria-label="道具設定顯示範圍"]');
        if (!rangeGroup) {
            $$('button').find((b) => b.textContent.includes('道具設定（使用、補給'))?.click();
            await sleep(300);
            rangeGroup = $('span[aria-label="道具設定顯示範圍"]');
        }
        const viewRadios = rangeGroup ? $$('input[type="radio"][name="item-view"]', rangeGroup) : [];
        if (viewRadios[1] && !viewRadios[1].checked) { viewRadios[1].click(); await sleep(350); }
    }

    // 【功能 4】掛機地圖下方：僅顯示【不處理】的物品（設定完成即消失）
    function injectMapDropPanel() {
        if ($('#ro-map-drop-panel')) return;
        const mapFs = $$('fieldset.xp-group').find((fs) => fs.textContent.includes('掛機地圖') && fs.querySelector('table.xp-table'));
        if (!mapFs) return;

        const statusEl = el('div', { id: 'ro-map-drop-status', textContent: '準備就緒', style: 'font-size:11px;margin-top:4px;color:#aaa;' });
        const listEl = el('div', { id: 'ro-map-drop-mirror-list', className: 'xp-sunken', style: 'max-height:240px;overflow-y:auto;padding:4px 6px;font-size:12px;background:rgba(20,24,30,.92);' }, ['載入中...']);

        const batchActions = [
            ['1. 裝備類存倉', '#74b9ff', (name) => EQUIP_KEYWORDS.some((k) => name.includes(k)), 2],
            ['2. 卡片貴重金屬存倉', '#d6a2e8', (name) => PRECIOUS_KEYWORDS.some((k) => name.includes(k)), 2],
            ['3. 全部存倉', '#55efc4', () => true, 2],
            ['4. 全部賣出', '#ff7675', () => true, 1]
        ];

        const panel = el('div', { id: 'ro-map-drop-panel', style: 'margin-top:8px;padding:6px 8px;border:1px solid #808080;background:rgba(0,0,0,.25);' }, [
            el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;' }, [
                el('span', { textContent: '🎁 本圖物品掉落（僅顯示目前為【不處理】的物品）：', style: 'font-weight:bold;font-size:12px;' }),
                el('button', {
                    type: 'button', className: 'xp-btn small', textContent: '🔄 重新整理清單',
                    onclick: async () => {
                        statusEl.style.color = '#ffeaa7';
                        statusEl.textContent = '⏳ 正在同步清單...';
                        await ensureItemListLoaded();
                        renderUntreatedList();
                        renderConsumablesList();
                    }
                })
            ]),
            el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;' }, batchActions.map(([label, color, matchFn, targetIdx]) =>
                el('button', {
                    type: 'button', className: 'xp-btn small', textContent: label, style: `color:${color};font-weight:bold;`,
                    onclick: async () => {
                        await ensureItemListLoaded();
                        const rows = getUntreatedRows();
                        if (!rows.length) return alert('目前沒有【不處理】的物品！');
                        let count = 0;
                        for (const { radios, itemName } of rows) {
                            if (matchFn(itemName) && !radios[targetIdx].checked) { radios[targetIdx].click(); count++; await sleep(40); }
                        }
                        statusEl.style.color = '#4caf50';
                        statusEl.textContent = `✅ 已設定 ${count} 項物品（記得按下方「套用設定」儲存）。`;
                        await sleep(150);
                        renderUntreatedList();
                        renderConsumablesList();
                    }
                })
            )),
            listEl,
            statusEl
        ]);

        mapFs.appendChild(panel);
        setTimeout(async () => { await ensureItemListLoaded(); renderUntreatedList(); renderConsumablesList(); }, 650);
    }

    function getUntreatedRows() {
        const listUl = $('ul[aria-label="道具設定清單"]');
        if (!listUl) return [];
        return $$('li[data-item]', listUl).map((li) => {
            const id = li.getAttribute('data-item');
            const radios = $$(`input[type="radio"][name="item-town-${id}"]`, li);
            if (radios.length < 3 || !radios[0].checked) return null;
            const itemName = li.querySelector('div > span')?.textContent.trim() ||
                radios[0].getAttribute('aria-label')?.replace(/\s*不處理$/, '').trim() || `物品#${id}`;
            return { container: li, radios, itemName };
        }).filter(Boolean);
    }

    function renderUntreatedList() {
        const box = $('#ro-map-drop-mirror-list');
        const statusEl = $('#ro-map-drop-status');
        if (!box) return;

        const rows = getUntreatedRows();
        box.innerHTML = '';
        if (!rows.length) {
            box.appendChild(el('div', { textContent: '🎉 目前沒有任何【不處理】的物品！', style: 'color:#55efc4;padding:6px;' }));
            if (statusEl) { statusEl.textContent = '📊 待處理（不處理）物品：0 項'; statusEl.style.color = '#55efc4'; }
            return;
        }

        rows.forEach(({ container, radios, itemName }, idx) => {
            const prioCb = $$('label', container).find((l) => l.textContent.includes('優先撿'))?.querySelector('input[type="checkbox"]');
            let color = '#e0e0e0';
            if (itemName.includes('卡片')) color = '#ff7675';
            else if (EQUIP_KEYWORDS.some((k) => itemName.includes(k))) color = '#74b9ff';
            else if (PRECIOUS_KEYWORDS.some((k) => itemName.includes(k))) color = '#d6a2e8';

            const groupName = `ro-m-${idx}-${Date.now()}`;
            const rowDiv = el('div', { style: 'padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.12);display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;' }, [
                el('span', { textContent: itemName, style: `color:${color};${itemName.includes('卡片') ? 'font-weight:bold;' : ''}` }),
                el('div', { style: 'display:inline-flex;align-items:center;gap:8px;font-size:11px;color:#ccc;' }, [
                    ...['不處理', '賣', '存'].map((txt, val) => el('label', {
                        style: `cursor:pointer;display:inline-flex;align-items:center;gap:2px;${val === 1 ? 'color:#ff9f43;' : val === 2 ? 'color:#55efc4;' : ''}`
                    }, [
                        el('input', {
                            type: 'radio', name: groupName, checked: val === 0,
                            onchange: () => {
                                if (!radios[val] || radios[val].checked) return;
                                radios[val].click();
                                if (val !== 0) {
                                    rowDiv.remove();
                                    const rem = box.children.length;
                                    if (!rem) box.appendChild(el('div', { textContent: '🎉 目前沒有任何【不處理】的物品！', style: 'color:#55efc4;padding:6px;' }));
                                    if (statusEl) statusEl.textContent = `📊 剩餘待處理（不處理）物品：${rem} 項`;
                                }
                            }
                        }),
                        ` ${txt}`
                    ])),
                    ...(prioCb ? [el('label', { style: 'cursor:pointer;display:inline-flex;align-items:center;gap:2px;margin-left:4px;color:#ffeaa7;' }, [
                        el('input', { type: 'checkbox', checked: prioCb.checked, onchange: (e) => { if (e.target.checked !== prioCb.checked) prioCb.click(); } }),
                        ' 優先撿'
                    ])] : [])
                ])
            ]);
            box.appendChild(rowDiv);
        });

        if (statusEl) {
            statusEl.style.color = '#ffeaa7';
            statusEl.textContent = `📊 目前待處理（不處理）物品共 ${rows.length} 項（設定為賣或存後會自動消去）：`;
        }
    }

    // 【功能 5】藥水與補給下方：雙向同步可使用消耗品、蒼蠅/蝴蝶翅膀與箭矢
    function injectPotionPanel() {
        if ($('#ro-potion-mirror-panel')) return;
        const potionFs = $$('fieldset.xp-group').find((fs) => fs.querySelector('legend')?.textContent.includes('藥水與補給'));
        if (!potionFs) return;

        const statusEl = el('div', { id: 'ro-consumables-status', textContent: '※ 所有設定修改後均保留於此並即時同步至下方「道具設定」（完成後請按「套用設定」）。', style: 'font-size:11px;margin-top:4px;color:#aaa;' });
        const listEl = el('div', { id: 'ro-consumables-mirror-list', className: 'xp-sunken', style: 'max-height:300px;overflow-y:auto;padding:4px 6px;font-size:12px;background:rgba(20,24,30,.92);' }, ['載入中...']);

        const panel = el('div', { id: 'ro-potion-mirror-panel', style: 'margin-top:8px;padding:6px 8px;border:1px solid #808080;background:rgba(0,0,0,.25);' }, [
            el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;flex-wrap:wrap;gap:4px;' }, [
                el('span', { textContent: '🧪 可使用消耗品、傳送翅膀與箭矢設定（雙向即時同步）：', style: 'font-weight:bold;font-size:12px;' }),
                el('div', { style: 'display:inline-flex;gap:4px;' }, [
                    el('button', {
                        type: 'button', className: 'xp-btn small', textContent: '⚡ 一鍵全開用途', style: 'color:#ffeaa7;font-weight:bold;',
                        onclick: async function () {
                            this.disabled = true;
                            const orig = this.textContent;
                            this.textContent = '開啟中...';
                            try {
                                await ensureItemListLoaded();
                                let count = 0;
                                for (const { usageSelect } of getConsumableRows()) {
                                    if (!isUnsetSelect(usageSelect)) continue;
                                    const validOpt = Array.from(usageSelect.options).find((o) => o.value && o.value !== 'none' && !o.text.includes('不使用') && !o.text.includes('不自動'));
                                    if (validOpt) { setReactVal(usageSelect, validOpt.value); count++; await sleep(45); }
                                }
                                await sleep(150);
                                renderConsumablesList();
                                statusEl.style.color = '#4caf50';
                                statusEl.textContent = `✅ 已開啟 ${count} 項未設定用途的消耗品（原有設定完整保留，記得按「套用設定」）。`;
                            } finally {
                                this.disabled = false;
                                this.textContent = orig;
                            }
                        }
                    }),
                    el('button', {
                        type: 'button', className: 'xp-btn small', textContent: '🔄 同步重整',
                        onclick: async () => {
                            statusEl.style.color = '#ffeaa7';
                            statusEl.textContent = '⏳ 正在同步所有可使用消耗品、翅膀與箭矢...';
                            await ensureItemListLoaded();
                            renderConsumablesList();
                        }
                    })
                ])
            ]),
            listEl,
            statusEl
        ]);

        potionFs.appendChild(panel);
    }

    function getConsumableRows() {
        const listUl = $('ul[aria-label="道具設定清單"]');
        if (!listUl) return [];

        return $$('li[data-item]', listUl).map((li) => {
            const itemId = li.getAttribute('data-item');
            const usageSelect = li.querySelector('div:first-child select[aria-label$="用途"]');
            const titleSpan = li.querySelector('div:first-child > span');

            let pureName = '';
            if (titleSpan) {
                const clone = titleSpan.cloneNode(true);
                clone.querySelector('span')?.remove();
                pureName = clone.textContent.trim();
            }
            if (!pureName && usageSelect) pureName = usageSelect.getAttribute('aria-label').replace(/用途$/, '').trim();

            const isUsable = Boolean(usageSelect) ||
                pureName === '蒼蠅翅膀' || pureName === '蝴蝶翅膀' ||
                pureName.endsWith('箭矢') || pureName.endsWith('箭筒') || pureName.endsWith('飼料');

            if (!isUsable) return null;
            return { container: li, itemId, itemName: titleSpan?.textContent.trim() || pureName || `消耗品#${itemId}`, usageSelect };
        }).filter(Boolean);
    }

    function renderConsumablesList() {
        const box = $('#ro-consumables-mirror-list');
        const statusEl = $('#ro-consumables-status');
        if (!box) return;

        const rows = getConsumableRows();
        box.innerHTML = '';
        if (!rows.length) {
            box.appendChild(el('div', { textContent: '目前清單未讀取到可使用消耗品、翅膀或箭矢（請點擊右上角「🔄 同步重整」）。', style: 'color:#aaa;padding:6px;' }));
            if (statusEl) statusEl.textContent = '📊 可使用消耗品/翅膀/箭矢：0 項';
            return;
        }

        const rerenderBoth = async () => { await sleep(120); renderConsumablesList(); renderUntreatedList(); };

        rows.forEach(({ container, itemId, itemName, usageSelect }, idx) => {
            const mainInputs = $$('input', container).filter((inp) => !inp.closest('details'));
            const findCb = (kw) => mainInputs.find((i) => i.type === 'checkbox' && ((i.getAttribute('aria-label') || '').includes(kw) || i.parentElement?.textContent.includes(kw)));
            const findNum = (kw) => mainInputs.find((i) => i.type === 'number' && (i.getAttribute('aria-label') || '').includes(kw));

            const supplyCb = findCb('補給');
            const isActive = (usageSelect && !isUnsetSelect(usageSelect)) || Boolean(supplyCb?.checked);

            // 第一排：名稱 + 用途選單 + ▲▼✕
            const topRight = el('div', { style: 'display:inline-flex;align-items:center;gap:4px;' });
            if (usageSelect) {
                const mSel = el('select', {
                    className: 'xp-input', style: 'font-size:11px;padding:1px 4px;',
                    onchange: async () => { setReactVal(usageSelect, mSel.value); await sleep(120); renderConsumablesList(); }
                }, Array.from(usageSelect.options).map((o) => el('option', { value: o.value, textContent: o.text, selected: o.selected })));
                topRight.appendChild(mSel);
            }

            $$('div:first-child button.xp-btn', container).forEach((b) => {
                const t = b.textContent.trim();
                if (['▲', '▼', '✕', 'X'].includes(t)) {
                    topRight.appendChild(el('button', {
                        type: 'button', className: 'xp-btn small', textContent: t, disabled: b.disabled,
                        title: b.getAttribute('aria-label') || t, style: 'padding:0 4px;font-size:10px;',
                        onclick: async () => { b.click(); await rerenderBoth(); }
                    }));
                }
            });

            // 第二排：補給 + 少於/補到/門檻 + 先從倉庫拿 + 做成箭矢筒/散裝留
            const midRow = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11px;color:#ccc;' });
            if (supplyCb) {
                midRow.appendChild(el('label', { style: 'cursor:pointer;display:inline-flex;align-items:center;gap:2px;color:#74b9ff;font-weight:bold;' }, [
                    el('input', { type: 'checkbox', checked: supplyCb.checked, onchange: async (e) => { if (e.target.checked !== supplyCb.checked) { supplyCb.click(); await sleep(120); renderConsumablesList(); } } }),
                    '補給'
                ]));
            }

            mainInputs.filter((i) => i.type === 'number').forEach((origNum) => {
                const aria = origNum.getAttribute('aria-label') || '';
                if (aria.includes('保留') || origNum.parentElement?.textContent.includes('保留')) return;
                const hint = aria.includes('補給下限') ? '少於' : aria.includes('補到的數量') ? '補到' : aria.replace(/^[^\s]+\s*/, '').trim();
                midRow.appendChild(el('span', { style: 'display:inline-flex;align-items:center;gap:2px;color:#ffeaa7;' }, [
                    ...(hint && hint.length <= 8 ? [hint] : []),
                    el('input', { type: 'number', className: 'xp-input', value: origNum.value, style: 'width:50px;font-size:11px;padding:1px 3px;text-align:center;', oninput: (e) => setReactVal(origNum, e.target.value) })
                ]));
            });

            const whCb = findCb('倉庫拿');
            if (whCb) {
                midRow.appendChild(el('label', { style: 'cursor:pointer;display:inline-flex;align-items:center;gap:2px;color:#a29bfe;' }, [
                    el('input', { type: 'checkbox', checked: whCb.checked, onchange: (e) => { if (e.target.checked !== whCb.checked) whCb.click(); } }),
                    '先從倉庫拿'
                ]));
            }

            const qvCb = findCb('做成箭矢筒') || findCb('買回來做成');
            if (qvCb) {
                midRow.appendChild(el('label', { style: 'cursor:pointer;display:inline-flex;align-items:center;gap:2px;color:#fab1a0;' }, [
                    el('input', { type: 'checkbox', checked: qvCb.checked, onchange: async (e) => { if (e.target.checked !== qvCb.checked) { qvCb.click(); await sleep(120); renderConsumablesList(); } } }),
                    '做成箭矢筒'
                ]));
                const lkNum = findNum('散裝保留');
                if (lkNum) {
                    midRow.appendChild(el('span', { style: 'display:inline-flex;align-items:center;gap:2px;color:#fab1a0;' }, [
                        '散裝留',
                        el('input', { type: 'number', className: 'xp-input', value: lkNum.value, style: 'width:52px;font-size:11px;padding:1px 3px;text-align:center;', oninput: (e) => setReactVal(lkNum, e.target.value) }),
                        '支'
                    ]));
                }
            }

            // 第三排：回城(不處理/賣/存 + 保留量) + 優先撿
            const bottomRow = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:11px;color:#ccc;' });
            const townRadios = $$(`input[type="radio"][name="item-town-${itemId}"]`, container);
            if (townRadios.length >= 3) {
                const gName = `ro-c-town-${itemId}-${idx}-${Date.now()}`;
                const keepNum = findNum('存倉保留量');
                bottomRow.appendChild(el('span', { style: 'display:inline-flex;align-items:center;gap:5px;' }, [
                    '回城：',
                    ...['不處理', '賣', '存'].map((tLbl, val) => {
                        const dis = townRadios[val].disabled;
                        return el('label', {
                            title: dis ? '設了補給的道具回城不賣' : '',
                            style: `display:inline-flex;align-items:center;gap:2px;${dis ? 'opacity:.45;cursor:not-allowed;' : 'cursor:pointer;'}${val === 1 ? 'color:#ff9f43;' : val === 2 ? 'color:#55efc4;font-weight:bold;' : ''}`
                        }, [
                            el('input', {
                                type: 'radio', name: gName, checked: townRadios[val].checked, disabled: dis,
                                onchange: async () => { if (!townRadios[val].checked && !dis) { townRadios[val].click(); await rerenderBoth(); } }
                            }),
                            tLbl
                        ]);
                    }),
                    ...(keepNum ? [el('span', { style: 'display:inline-flex;align-items:center;gap:2px;color:#55efc4;margin-left:2px;' }, [
                        '保留',
                        el('input', { type: 'number', className: 'xp-input', value: keepNum.value, style: 'width:50px;font-size:11px;padding:1px 3px;text-align:center;', oninput: (e) => setReactVal(keepNum, e.target.value) })
                    ])] : [])
                ]));
            }

            const prioCb = findCb('優先撿');
            if (prioCb) {
                bottomRow.appendChild(el('label', { style: 'cursor:pointer;display:inline-flex;align-items:center;gap:2px;color:#ffeaa7;' }, [
                    el('input', { type: 'checkbox', checked: prioCb.checked, onchange: (e) => { if (e.target.checked !== prioCb.checked) prioCb.click(); } }),
                    '優先撿'
                ]));
            }

            box.appendChild(el('div', {
                style: `padding:6px;border-bottom:1px solid rgba(255,255,255,.16);display:flex;flex-direction:column;gap:5px;${isActive ? 'background:rgba(255,234,167,.08);' : ''}`
            }, [
                el('div', { style: 'display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;' }, [
                    el('span', { textContent: itemName, style: `font-weight:bold;color:${isActive ? '#ffeaa7' : '#e0e0e0'};` }),
                    topRight
                ]),
                ...(midRow.children.length ? [midRow] : []),
                ...(bottomRow.children.length ? [bottomRow] : [])
            ]));
        });

        if (statusEl) {
            statusEl.style.color = '#ffeaa7';
            statusEl.textContent = `📊 共偵測到 ${rows.length} 項可使用消耗品、翅膀與箭矢（全功能即時雙向同步，完成後請按「套用設定」）。`;
        }
    }
})();