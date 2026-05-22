# TradeLog — AI Trading Journal
## Инструкция по деплою на Vercel (с бесплатным Groq AI)

---

## Шаг 1 — Получить бесплатный Groq API ключ

1. Открыть **console.groq.com**
2. Sign Up → войти через Google или GitHub
3. Слева → **API Keys** → **Create API Key**
4. Скопировать ключ (начинается с `gsk_...`)

Groq бесплатный, карта не нужна. Лимит: ~14 400 запросов в день.

---

## Шаг 2 — Создать репозиторий на GitHub

1. Зайти на **github.com** → New repository
2. Назвать: `tradelog`
3. Public или Private — без разницы
4. Нажать **Create repository**

---

## Шаг 3 — Залить проект

Открыть **Git Bash** (установили раньше) в папке с проектом:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/tradelog.git
git push -u origin main
```

Вместо **ВАШ_ЛОГИН** — ваш логин на GitHub.

---

## Шаг 4 — Деплой на Vercel

1. Зайти на **vercel.com**
2. **Add New Project**
3. Выбрать репозиторий `tradelog` → **Import**
4. Framework Preset: выбрать **Vite**
5. Нажать **Deploy**

Подождать ~1 минуту. Сайт будет на адресе типа `tradelog-xxx.vercel.app`

---

## Шаг 5 — Добавить Groq API ключ в Vercel

1. В Vercel → ваш проект → **Settings**
2. Слева → **Environment Variables**
3. Добавить:
   - Name: `GROQ_API_KEY`
   - Value: `gsk_...ваш ключ...`
4. Нажать **Save**
5. Перейти в **Deployments** → три точки → **Redeploy**

---

## Шаг 6 — Готово!

Открывайте ваш сайт и пользуйтесь:
- **⚡ ИМПОРТ** — подключить Binance / Bybit / Ватагу по API ключу
- **⚡ AI** — разбор любой сделки
- **AI-ОТЧЁТ** — анализ всего периода

---

## Настройка API ключей на биржах

### Binance
Профиль → API Management → Create API → **Read Only** ✓

### Bybit
Account → API → Create New Key → **Read Only** ✓

### Ватага (Алор)
Личный кабинет → API → Refresh Token (вставляете в поле API Key)

---

## Как продавать

- **Разовая продажа** клиенту: 5 000–15 000 руб (деплоите отдельный проект)
- **Подписка**: 500–1 000 руб/мес (один сайт, добавляете авторизацию через Supabase)
- **White-label**: меняете логотип, берёте дороже
