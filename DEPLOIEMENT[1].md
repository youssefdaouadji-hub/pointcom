# 🚀 Mettre mon site en ligne — guide pas à pas

Ce guide est écrit pour quelqu'un qui débute. On ne saute aucune étape.
Prends ton temps, fais une étape, puis passe à la suivante.

Tu vas utiliser 3 services gratuits :
- **GitHub** — pour stocker les fichiers de ton site
- **Render** — pour mettre le site en ligne
- **Stripe** — pour encaisser les paiements (tu as déjà le compte)

⏱️ Compte environ 1 heure la première fois. C'est normal d'aller lentement.

---

## ⚠️ Règle de sécurité n°1

Ta **clé secrète Stripe** (`sk_live_...` ou `sk_test_...`) ne doit JAMAIS
être écrite dans un fichier que tu mets en ligne. On la saisira directement
dans Render, dans un espace privé prévu pour ça. Le fichier `.gitignore`
fourni protège déjà le fichier `.env`. Ne touche à rien, c'est automatique.

---

## Étape 1 — Rassembler les fichiers

1. Télécharge **tous** les fichiers du projet (le bouton de téléchargement
   sur chacun) : `index.html`, `merci.html`, `annule.html`,
   `espace-client.html`, `server.js`, `package.json`, `.gitignore`,
   `.env.example`, `README.md`.
2. Sur ton ordinateur, crée un dossier nommé `point-com`.
3. Mets tous ces fichiers **dans ce dossier**, ensemble.

✅ Tu dois avoir un seul dossier contenant tous les fichiers.

---

## Étape 2 — Créer un compte GitHub

1. Va sur **github.com** → bouton **Sign up**.
2. Entre un email, un mot de passe, un nom d'utilisateur. C'est gratuit.
3. Valide ton email.

✅ Tu es connecté(e) à GitHub.

---

## Étape 3 — Déposer les fichiers sur GitHub

1. En haut à droite, clique sur **+** → **New repository**.
2. Donne-lui un nom : `point-com`.
3. Laisse-le en **Public** (ou Private si tu préfères), ne coche rien d'autre.
4. Clique **Create repository**.
5. Sur la page suivante, clique le lien **"uploading an existing file"**
   (ou bouton **Add file → Upload files**).
6. Glisse **tous les fichiers** de ton dossier `point-com` dans la zone.
7. En bas, clique **Commit changes**.

✅ Tes fichiers apparaissent dans le dépôt GitHub.
   (Le fichier `.env` n'y est pas, et c'est voulu.)

---

## Étape 4 — Créer un compte Render

1. Va sur **render.com** → **Get Started** → connecte-toi
   **avec ton compte GitHub** (le plus simple). Pas de carte demandée.

✅ Tu es sur le tableau de bord Render.

---

## Étape 5 — Mettre le site en ligne

1. Clique **New +** → **Web Service**.
2. Render te propose tes dépôts GitHub → choisis **point-com** → **Connect**.
3. Vérifie / renseigne ces champs :
   - **Name** : `point-com`
   - **Region** : Frankfurt (Europe)
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free** (pour commencer)
4. Clique **Create Web Service**.
5. Patiente 2–4 minutes. Quand tu vois **"Live"**, ton site a une adresse,
   du type `https://point-com.onrender.com`. Note cette adresse.

✅ Ton site est en ligne ! (Le paiement, lui, s'active à l'étape suivante.)

---

## Étape 6 — Brancher Stripe (les clés)

> ⚠️ Avant tout : si tu as déjà collé ta clé `sk_live_...` quelque part,
> va dans Stripe → **Développeurs → Clés API → faire pivoter (Roll)** la clé
> secrète pour en générer une **nouvelle**. Utilise toujours la nouvelle.
>
> 💡 Conseil : commence avec la clé **`sk_test_...`** (mode test) pour tout
> vérifier sans argent réel. Tu passeras en `sk_live_...` au lancement.

1. Dans Render, ouvre ton service → onglet **Environment** → **Add Environment Variable**.
2. Ajoute ces lignes (Key = nom, Value = valeur) :
   - `STRIPE_SECRET_KEY` = ta clé Stripe (sk_test_... pour commencer)
   - `DOMAIN` = ton adresse Render (ex. `https://point-com.onrender.com`)
3. Clique **Save Changes**. Render redémarre tout seul.

✅ Le paiement par carte fonctionne maintenant en mode test.

---

## Étape 7 — Activer le prélèvement SEPA

1. Dans Stripe → **Paramètres → Moyens de paiement**.
2. Active **Prélèvement SEPA (SEPA Direct Debit)**.

✅ L'option SEPA apparaîtra sur la page de paiement.

---

## Étape 8 — Le webhook (notifications de paiement)

1. Dans Stripe → **Développeurs → Webhooks → Ajouter un endpoint**.
2. **URL** : `https://ton-adresse-render/webhook`
   (remplace par ton adresse réelle).
3. Choisis les événements :
   `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`,
   `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`.
4. Valide. Stripe affiche un **signing secret** `whsec_...` → copie-le.
5. Retourne dans Render → **Environment** → ajoute :
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
6. **Save Changes**.

✅ Tu seras notifié(e) des paiements et des prélèvements mensuels.

---

## Étape 9 — Activer l'espace client

1. Dans Stripe → **Paramètres → Facturation → Portail client** → **Activer**.
2. Coche les actions autorisées (résiliation d'abonnement, etc.).

✅ Tes clients pourront gérer/résilier leur maintenance seuls.

---

## Étape 10 — Tester de bout en bout (mode test)

1. Ouvre ton site, choisis un pack, coche la maintenance, va au paiement.
2. Carte de test Stripe : `4242 4242 4242 4242`, date future, CVC `123`.
3. IBAN SEPA de test : `FR1420041010050500013M02606`.
4. Vérifie que tu arrives bien sur la page **Merci**.

✅ Si tout marche en test, tu es prêt(e) pour le réel.

---

## Étape 11 — Passer en vrai (jour du lancement)

1. Dans Render → Environment → remplace `STRIPE_SECRET_KEY` par ta clé
   **`sk_live_...`**.
2. (Recommandé) Passe l'instance Render en **Starter (7 $/mois)** pour que le
   site reste toujours actif (l'offre gratuite se met en veille et le 1er
   paiement attendrait ~1 min).
3. (Optionnel) Achète ton domaine `point-com.fr` (OVH, Gandi…) et relie-le
   dans Render → **Settings → Custom Domains**. HTTPS est automatique.
   Pense à mettre `DOMAIN` à jour avec la nouvelle adresse.

🎉 Ton site encaisse de vrais paiements.

---

## Besoin d'aide à une étape précise ?

Reviens me dire **à quelle étape tu es** et **ce que tu vois à l'écran**,
et je te guide ligne par ligne.
