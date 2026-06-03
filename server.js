/**
 * point com — Backend de paiement Stripe
 * --------------------------------------
 * • Pack Vitrine (99€) ou Pro (129€) — paiement unique
 * • + Maintenance (9,99€/mois) — abonnement prélevé par SEPA (optionnel)
 * • Webhook Stripe — notifications de paiement (carte + SEPA différé)
 * • Page de confirmation /merci.html
 *
 * Lancement :
 *   1) npm install express stripe cors dotenv
 *   2) cp .env.example .env  → collez votre clé sk_... vous-même
 *   3) node server.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
app.use(cors());

const DOMAIN = process.env.DOMAIN || 'http://localhost:4242';

// Tarifs (en centimes)
const PACKS = {
  Vitrine: { label: 'Site Vitrine — clé en main', amount: 9900 },
  Pro:     { label: 'Site Pro — réservation ou vente en ligne', amount: 12900 },
};
const MAINTENANCE = { label: 'Maintenance & modifications illimitées', amount: 999 };

/* ------------------------------------------------------------------ *
 * 1) WEBHOOK STRIPE
 *    Doit être déclaré AVANT express.json() et utiliser le corps brut.
 *    Configurez l'URL https://votre-domaine/webhook dans
 *    Stripe > Développeurs > Webhooks, puis copiez le "signing secret"
 *    (whsec_...) dans STRIPE_WEBHOOK_SECRET du fichier .env.
 * ------------------------------------------------------------------ */
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = secret
      ? stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body); // tolérance en dev si pas de secret configuré
  } catch (err) {
    console.error('⚠️  Signature webhook invalide :', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      console.log(`🟢 Commande validée — ${s.metadata?.formule || ''} | client ${s.customer_email || ''} | maintenance: ${s.metadata?.maintenance || 'non'}`);
      if (s.payment_status === 'paid') console.log('   Paiement encaissé immédiatement.');
      else console.log('   Paiement SEPA en cours (confirmation sous 2-5 jours).');
      // → ici : envoyez un email de confirmation, créez la commande en base, etc.
      break;
    }
    case 'checkout.session.async_payment_succeeded':
      console.log('✅ Paiement SEPA confirmé pour la commande', event.data.object.id);
      break;
    case 'checkout.session.async_payment_failed':
      console.log('❌ Paiement SEPA échoué pour la commande', event.data.object.id);
      break;
    case 'invoice.paid':
      console.log('💶 Mensualité de maintenance encaissée :', (event.data.object.amount_paid / 100) + '€');
      break;
    case 'invoice.payment_failed':
      console.log('⚠️  Échec de prélèvement de la mensualité de maintenance.');
      break;
    case 'customer.subscription.deleted':
      console.log('🔚 Abonnement maintenance résilié.');
      break;
    default:
      // autres événements ignorés
      break;
  }
  res.json({ received: true });
});

/* ------------------------------------------------------------------ *
 * Middlewares pour les routes "normales"
 * ------------------------------------------------------------------ */
app.use(express.json());
app.use(express.static('.')); // sert index.html et merci.html

/* ------------------------------------------------------------------ *
 * 2) CRÉATION DE LA SESSION DE PAIEMENT
 * ------------------------------------------------------------------ */
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { formula, maintenance, name, email, project } = req.body;
    const pack = PACKS[formula];
    if (!pack) return res.status(400).json({ error: 'Pack invalide.' });

    const line_items = [{
      price_data: {
        currency: 'eur',
        product_data: { name: pack.label },
        unit_amount: pack.amount,
      },
      quantity: 1,
    }];

    let mode = 'payment';

    if (maintenance) {
      // Le pack est facturé une fois sur la 1re facture, la maintenance
      // est ensuite prélevée chaque mois par SEPA.
      mode = 'subscription';
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: MAINTENANCE.label },
          unit_amount: MAINTENANCE.amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ['card', 'sepa_debit'], // carte + prélèvement SEPA
      line_items,
      customer_email: email || undefined,
      locale: 'fr',
      success_url: `${DOMAIN}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/annule.html`,
      metadata: {
        nom: name || '',
        formule: formula,
        maintenance: maintenance ? 'oui' : 'non',
        projet: (project || '').slice(0, 480),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
});

/* ------------------------------------------------------------------ *
 * 3) RÉCAPITULATIF pour la page de confirmation
 * ------------------------------------------------------------------ */
app.get('/session-status', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    res.json({
      email: session.customer_details?.email || session.customer_email || '',
      nom: session.metadata?.nom || '',
      formule: session.metadata?.formule || '',
      maintenance: session.metadata?.maintenance === 'oui',
      total: (session.amount_total || 0) / 100,
      statut: session.payment_status, // 'paid' ou 'unpaid' (SEPA en cours)
    });
  } catch (err) {
    res.status(404).json({ error: 'Session introuvable.' });
  }
});

/* ------------------------------------------------------------------ *
 * 4) PORTAIL CLIENT (gérer / résilier l'abonnement maintenance)
 *    Le client saisit son email → on retrouve son compte Stripe →
 *    on ouvre le portail de facturation hébergé par Stripe.
 *    Activez d'abord le portail : Dashboard Stripe > Paramètres >
 *    Facturation > Portail client.
 * ------------------------------------------------------------------ */
app.post('/customer-portal', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis.' });

    const customers = await stripe.customers.list({ email: email.trim(), limit: 1 });
    if (!customers.data.length) {
      return res.status(404).json({ error: "Aucun abonnement trouvé pour cet email. Vérifiez l'adresse utilisée lors du paiement." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${DOMAIN}/`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Impossible d'ouvrir le portail pour le moment." });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`✅ point com — serveur Stripe sur ${DOMAIN} (port ${PORT})`));
