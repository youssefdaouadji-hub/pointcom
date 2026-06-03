# point com — Site + paiement Stripe (SEPA)

Site vitrine de l'agence avec paiement intégré : pack Vitrine (199€) ou Pro (259€) en paiement unique, plus une option Maintenance (9,99€/mois) prélevée par **SEPA** via Stripe.

## Fichiers

- `index.html` — le site (front-end)
- `merci.html` — page de confirmation après paiement
- `annule.html` — page affichée si le client abandonne le paiement
- `espace-client.html` — accès au portail Stripe (gérer / résilier l'abonnement)
- `server.js` — backend Stripe (paiement + webhook + portail client + récap)
- `.env.example` — modèle de configuration (à copier en `.env`)

## Comment ça marche

1. Le visiteur choisit un pack et, s'il le souhaite, active la **maintenance**.
2. À la validation, le site appelle `server.js` qui crée une **session Stripe Checkout**.
3. Le visiteur est redirigé vers la page sécurisée Stripe où il paie par **carte ou prélèvement SEPA**. L'IBAN et le mandat SEPA sont saisis chez Stripe — jamais sur votre site.
4. Si la maintenance est activée, Stripe met en place un **abonnement mensuel** (le pack est facturé une fois, la maintenance chaque mois).

## Installation

```bash
# 1. Installer les dépendances
npm init -y
npm install express stripe cors dotenv

# 2. Configurer Stripe
cp .env.example .env
#   puis ouvrez .env et collez votre clé secrète Stripe (sk_test_... ou sk_live_...)

# 3. Lancer
node server.js
```

Ouvrez ensuite **http://localhost:4242**.

## Récupérer votre clé Stripe

Dashboard Stripe → **Développeurs → Clés API** → copiez la *clé secrète*.
Commencez avec la clé `sk_test_...` pour tester sans débit réel
(IBAN de test SEPA fourni par Stripe : `FR1420041010050500013M02606`).

## Activer le SEPA

Dans le Dashboard Stripe → **Paramètres → Moyens de paiement**, activez
**Prélèvement SEPA (SEPA Direct Debit)**. C'est nécessaire pour que l'option
apparaisse sur la page de paiement.

## Passer en production

1. Remplacez la clé `sk_test_...` par votre clé `sk_live_...` dans `.env`.
2. Mettez `DOMAIN` sur l'URL réelle de votre site (ex. `https://point-com.fr`).
3. Hébergez le tout sur un service Node (Render, Railway, Vercel, OVH, etc.).

## Webhook Stripe (déjà intégré)

Le serveur expose une route `/webhook` qui réagit aux événements Stripe :
commande validée, paiement SEPA confirmé ou échoué, mensualité de maintenance
encaissée, abonnement résilié. Pour l'activer :

1. Dashboard Stripe → **Développeurs → Webhooks → Ajouter un endpoint**.
2. URL : `https://votre-domaine/webhook`.
3. Sélectionnez les événements : `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.deleted`.
4. Copiez le **signing secret** (`whsec_...`) dans `STRIPE_WEBHOOK_SECRET` (`.env`).

Dans `server.js`, les `console.log` du webhook indiquent où brancher vos
actions : envoi d'email de confirmation, enregistrement de la commande, etc.

Pour tester le webhook en local, utilisez la CLI Stripe :
`stripe listen --forward-to localhost:4242/webhook`

## Portail client (gérer / résilier l'abonnement)

La page `espace-client.html` permet à un client de saisir son email et
d'accéder au **portail de facturation Stripe** : consulter ses factures,
mettre à jour son IBAN et résilier la maintenance lui-même.

Avant utilisation, activez-le une fois dans le Dashboard Stripe :
**Paramètres → Facturation → Portail client → Activer**, puis choisissez
les actions autorisées (annulation d'abonnement, mise à jour du moyen de
paiement, etc.). Sans cette activation, le portail renverra une erreur.

Le lien « Espace client » est déjà présent dans le pied de page du site.

## Bon à savoir sur le SEPA

- Un paiement SEPA n'est pas instantané : la confirmation peut prendre
  **2 à 5 jours ouvrés**. Stripe vous notifie quand le prélèvement est validé.
- Le client peut résilier l'abonnement de maintenance à tout moment depuis
  votre Dashboard Stripe (ou via un portail client Stripe si vous l'activez).
