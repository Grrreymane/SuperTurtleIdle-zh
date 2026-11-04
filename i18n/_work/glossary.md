# 超级乌龟放置 汉化规范

游戏：Super Turtle Idle，一款英文放置 RPG，主角是乌龟，语气轻松、爱玩梗。译成**简体中文**，给中国玩家玩。

## 规则

- 语气活泼自然，别翻译腔。玩笑和吐槽要让中文读者也觉得好笑，可以意译。按钮和标签要短。
- `{0}`、`{1}` 占位符必须原样保留，个数相同，可以调换顺序。
- emoji、`❖`、`💠`、`[`、`]`、`(`、`)` 等符号保留。英文句末的 `.` 换成 `。`，`!` 换成 `！`，`?` 换成 `？`。
- **不要译的**：玩家 / 赞助者的网名、`EXP` 以外的纯编号；看起来不是显示给玩家的代码或内部标识（如 `rpgClass.TG0`），译文写 `null`。罗马数字（`II`、`IX`）写 `null`。
- 带 `s` 字段的条目是一句话被图标或变量切开后的**片段**。`s` 是整句，`▮` 是切断处，`{}` 是变量。切断的顺序不能变，所以译文要保证片段**按原顺序接起来读得通**。例：
  - `Increases Might Damage by` → `使武力伤害提高`（后面接数值）
  - `Unlock with a` ▮ `Copper Key to open` → `使用` ▮ `铜钥匙打开`
- `k` 字段是数据来源：`name` 名称，`description` 描述，`flavor` 风味文字，`hint` / `objective` 提示和目标，`body` 邮件正文。
- 专有名词全篇一致：地名、怪物名、人名按音或按意译都行，同一个词只用一种译法。

## 术语表

| 英文 | 中文 | 英文 | 中文 |
|---|---|---|---|
| Super Turtle Idle | 超级乌龟放置 | Turtle | 乌龟 |
| Super Turtle | 超级乌龟 | Super Turtle Adventure | 超级乌龟冒险 |
| Shells（货币） | 贝壳 | shell（龟壳） | 龟壳 |
| Might | 武力 | Nature | 自然 |
| Elemental | 元素 | Occult | 秘术 |
| Deific | 神圣 | Alignment | 属性 |
| Strength | 力量 | Holy | 圣光 |
| Damage | 伤害 | Weapon Damage | 武器伤害 |
| Bonus | 加成 | Resistance | 抗性 |
| Health / HP | 生命 | Max Health / Max HP | 最大生命 |
| Magic（资源） | 魔力 | Spellpower | 法术强度 |
| Mastery | 精通 | Attack Speed | 攻击速度 |
| Attack | 攻击 | Regeneration | 生命恢复 |
| Healing | 治疗 | EXP | 经验 |
| Level | 等级 | Rank | 阶级 |
| Drop Bonus | 掉落加成 | Drop Rate | 掉落率 |
| Skill(s) | 技能 | Talent(s) | 天赋 |
| Cooldown | 冷却 | Buff / Debuff | 增益 / 减益 |
| Silence | 沉默 | Poison | 中毒 |
| Sanity | 理智 | Gathering | 采集 |
| Fishing | 钓鱼 | Gardening | 园艺 |
| Garden | 花园 | Alchemy | 炼金 |
| Crafting | 制作 | Recipe | 配方 |
| Research | 研究 | Garrison | 驻地 |
| Armory | 军械库 | Bestiary | 怪物图鉴 |
| Dungeon | 地下城 | Boss | 首领 |
| Monster | 怪物 | Enemy | 敌人 |
| Area | 区域 | Quest(s) | 任务 |
| Achievement(s) | 成就 | Medal | 奖章 |
| Relic | 遗物 | Set（套装） | 套装 |
| Series | 系列 | Tier | 阶 |
| Tincture | 酊剂 | Flask | 药瓶 |
| Potion | 药水 | Fertiliser | 肥料 |
| Glitterstone | 闪光石 | Arcanite | 奥术矿 |
| Fossil | 化石 | Key | 钥匙 |
| Penguin | 企鹅 | Pat（摸乌龟） | 摸摸 |
| Present(s) | 礼物 | Mystery Present | 神秘礼物 |
| Stamp | 印章 | Stamper | 盖章器 |
| Consumable | 消耗品 | Equipable | 可装备 |
| Weapon | 武器 | Armor | 护甲 |
| Ring | 戒指 | Gloves | 手套 |
| Material | 材料 | Miscellaneous | 杂项 |
| Collectible | 收藏品 | Container | 容器 |
| Poor | 粗糙 | Common | 普通 |
| Uncommon | 优秀 | Rare | 稀有 |
| Epic | 史诗 | Mythic | 神话 |
| Heirloom | 传家宝 | Masterwork | 杰作 |
| Forgotten | 遗忘 | Right Click | 右键点击 |
| Left Click | 左键点击 | Use:（物品效果开头） | 使用： |
| Equip | 装备 | Sell | 出售 |

## 已定的补充译名

Legendary 传说；Upgrade（品质/动作）强化；Soulbound 灵魂绑定；Cache 宝匣；Mimic 宝箱怪；Boost 增幅；Voucher 兑换券；Blueprint 蓝图；Recipe: 配方：；Infused Tech 灌注科技；Cuirass 胸甲；Gauntlets 护手；Mattock 鹤嘴锄；Gamba 虾；Tortugas 龟岛；Pringu 品鹅；King-Kat 猫王；Hoopperoona 跳圈魔兔；Jungle King 丛林之王；Nightmare 梦魇；Explorer 探险家；Captain 船长；Whiskers 猫须；Tortumom 龟妈妈；Ancient X 远古X；Flawless X 无瑕X；Overpowered 超模。

每批还有一个 names 文件，列出这批里出现的专有名词的既定译名，必须照用。
