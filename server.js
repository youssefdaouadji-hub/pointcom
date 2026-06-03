/**
 * point com — Backend de paiement Stripe
 * --------------------------------------
 * • Pack Vitrine (199€) ou Pro (259€) — paiement unique
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
  Vitrine: { label: 'Site Vitrine — clé en main', amount: 19900 },
  Pro:     { label: 'Site Pro — réservation ou vente en ligne', amount: 25900 },
};
const MAINTENANCE = { label: 'Maintenance & modifications illimitées', amount: 999 };

/* ------------------------------------------------------------------ *
 * EMAIL — notification de commande sur votre boîte Gmail
 *    Renseignez dans .env :
 *      GMAIL_USER         = votre adresse Gmail
 *      GMAIL_APP_PASSWORD = un "mot de passe d'application" Google (16 lettres)
 *      ORDER_EMAIL        = où recevoir les commandes (par défaut le Gmail)
 * ------------------------------------------------------------------ */
const nodemailer = require('nodemailer');
const ORDER_EMAIL = process.env.ORDER_EMAIL || 'pointcom.mtp@gmail.com';

let transporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

async function sendOrderEmail(session) {
  if (!transporter) {
    console.log('✉️  Email non configuré (ajoutez GMAIL_USER et GMAIL_APP_PASSWORD).');
    return;
  }
  const m = session.metadata || {};
  const clientEmail = session.customer_details?.email || session.customer_email || '—';
  const total = ((session.amount_total || 0) / 100).toFixed(2);
  const statut = session.payment_status === 'paid'
    ? '✅ Payé'
    : '⏳ Paiement SEPA en cours (confirmation sous 2 à 5 jours)';
  const maint = m.maintenance === 'oui' ? 'Oui (+9,99€/mois SEPA)' : 'Non';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#070711;color:#fff;padding:20px 24px;font-size:18px;font-weight:bold">🟢 Nouvelle commande — point com</div>
      <div style="padding:24px">
        <table style="width:100%;border-collapse:collapse;font-size:15px;color:#222">
          <tr><td style="padding:8px 0;color:#888">Pack</td><td style="padding:8px 0;font-weight:bold">${m.formule || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#888">Maintenance</td><td style="padding:8px 0">${maint}</td></tr>
          <tr><td style="padding:8px 0;color:#888">Montant payé</td><td style="padding:8px 0;font-weight:bold">${total} €</td></tr>
          <tr><td style="padding:8px 0;color:#888">Statut</td><td style="padding:8px 0">${statut}</td></tr>
          <tr><td style="padding:8px 0;color:#888">Client</td><td style="padding:8px 0">${m.nom || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#888">Email</td><td style="padding:8px 0">${clientEmail}</td></tr>
          <tr><td style="padding:8px 0;color:#888;vertical-align:top">Projet</td><td style="padding:8px 0;white-space:pre-wrap">${(m.projet || '—').replace(/</g,'&lt;')}</td></tr>
        </table>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `point com <${process.env.GMAIL_USER}>`,
      to: ORDER_EMAIL,
      replyTo: clientEmail !== '—' ? clientEmail : undefined,
      subject: `🟢 Commande ${m.formule || ''}${m.maintenance === 'oui' ? ' + maintenance' : ''} — ${total}€`,
      html,
    });
    console.log('✉️  Email de commande envoyé à', ORDER_EMAIL);
  } catch (e) {
    console.error('Erreur envoi email :', e.message);
  }
}

// Email de confirmation envoyé AU CLIENT, aux couleurs de point com
async function sendCustomerEmail(session) {
  if (!transporter) return;
  const clientEmail = session.customer_details?.email || session.customer_email;
  if (!clientEmail) return;

  const m = session.metadata || {};
  const prenom = (m.nom || '').trim().split(' ')[0] || '';
  const total = ((session.amount_total || 0) / 100).toFixed(2);
  const packLabel = m.formule === 'Pro' ? 'Site Pro' : 'Site Vitrine';
  const sepaEnCours = session.payment_status !== 'paid';

  const ligneMaint = m.maintenance === 'oui'
    ? `<tr><td style="padding:10px 0;color:#8a90b0">Maintenance</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#0a0c1c">9,99€ / mois (SEPA)</td></tr>`
    : '';
  const noteSepa = sepaEnCours
    ? `<div style="background:#eefbf7;border:1px solid #b8efe0;border-radius:12px;padding:14px 16px;margin:22px 0;font-size:14px;color:#0c6b57">🏦 Votre paiement par prélèvement SEPA est en cours de traitement. Il sera confirmé sous 2 à 5 jours ouvrés — vous recevrez un email dès validation.</div>`
    : '';
  const noteMaint = m.maintenance === 'oui'
    ? `<p style="font-size:14px;color:#555">Vous avez souscrit à la maintenance illimitée. Vous pourrez gérer ou résilier votre abonnement à tout moment depuis votre espace client : <a href="${DOMAIN}/espace-client.html" style="color:#6b5cff">${DOMAIN}/espace-client.html</a></p>`
    : '';

  const html = `
  <div style="background:#f4f5fb;padding:30px 0;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(20,20,60,.08)">
      <div style="background:#070711;padding:26px 30px;text-align:center">
        <span style="font-size:22px;font-weight:bold;letter-spacing:1px;color:#fff">point<span style="color:#5eead4">com</span></span>
      </div>
      <div style="padding:36px 34px;text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:#eafaf6;margin:0 auto 18px;line-height:64px;font-size:30px">✅</div>
        <h1 style="font-size:24px;color:#0a0c1c;margin:0 0 8px">Merci ${prenom} !</h1>
        <p style="font-size:16px;color:#555;margin:0 0 4px">Votre commande est confirmée.</p>
        <p style="font-size:15px;color:#888;margin:0 0 26px">Nous sommes ravis de vous accompagner. 🚀</p>

        <table style="width:100%;border-collapse:collapse;text-align:left;border-top:1px solid #eee;border-bottom:1px solid #eee">
          <tr><td style="padding:10px 0;color:#8a90b0">Formule</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#0a0c1c">${packLabel}</td></tr>
          ${ligneMaint}
          <tr><td style="padding:10px 0;color:#8a90b0">Payé aujourd'hui</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#0a0c1c">${total} €</td></tr>
        </table>

        ${noteSepa}

        <div style="text-align:left;margin:26px 0 0">
          <h2 style="font-size:16px;color:#0a0c1c;margin:0 0 8px">Et maintenant ?</h2>
          <p style="font-size:14px;color:#555;margin:0 0 14px">Notre équipe vous contacte sous <b>24h</b> pour récupérer vos contenus (textes, photos, infos) et démarrer la création de votre site. Vous pouvez aussi répondre directement à cet email.</p>
          ${noteMaint}
        </div>

        <a href="${DOMAIN}" style="display:inline-block;margin-top:22px;background:#070711;color:#fff;text-decoration:none;font-weight:600;padding:13px 28px;border-radius:999px;font-size:14px">Voir notre site →</a>
      </div>
      <div style="background:#fafbff;padding:22px 30px;text-align:center;font-size:12px;color:#9aa0c4;border-top:1px solid #eee">
        point com — Agence marketing digital · Montpellier, France<br>
        Une question ? Répondez simplement à cet email.
      </div>
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `point com <${process.env.GMAIL_USER}>`,
      to: clientEmail,
      replyTo: ORDER_EMAIL,
      subject: 'Merci pour votre commande — point com ✨',
      html,
    });
    console.log('✉️  Email de confirmation envoyé au client', clientEmail);
  } catch (e) {
    console.error('Erreur envoi email client :', e.message);
  }
}

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
      sendOrderEmail(s); // → email de notification sur votre boîte
      sendCustomerEmail(s); // → email de confirmation au client
      break;
    }
    case 'checkout.session.async_payment_succeeded':
      console.log('✅ Paiement SEPA confirmé pour la commande', event.data.object.id);
      sendOrderEmail(event.data.object); // notification quand le SEPA est confirmé
      sendCustomerEmail(event.data.object); // confirmation au client (SEPA validé)
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
      allow_promotion_codes: true, // affiche le champ "code promo" (ex. NASDAS)
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

/* ------------------------------------------------------------------ *
 * CODE PROMO — "NASDAS" : -50% (créé automatiquement au démarrage)
 *   Réduction de 50% appliquée à la commande quand le client saisit le
 *   code NASDAS sur la page de paiement Stripe.
 * ------------------------------------------------------------------ */
async function ensurePromo() {
  try {
    // 1) Le coupon (-50%, appliqué une fois)
    let coupon;
    try {
      coupon = await stripe.coupons.retrieve('NASDAS50');
    } catch {
      coupon = await stripe.coupons.create({
        id: 'NASDAS50',
        percent_off: 50,
        duration: 'once',
        name: 'NASDAS -50%',
      });
    }
    // 2) Le code promo lisible que le client tape
    const existing = await stripe.promotionCodes.list({ code: 'NASDAS', limit: 1 });
    if (!existing.data.length) {
      await stripe.promotionCodes.create({ coupon: coupon.id, code: 'NASDAS' });
      console.log('🎟️  Code promo NASDAS créé (-50%).');
    } else {
      console.log('🎟️  Code promo NASDAS déjà actif.');
    }
  } catch (e) {
    console.error('Code promo non initialisé :', e.message);
  }
}

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`✅ point com — serveur Stripe sur ${DOMAIN} (port ${PORT})`);
  ensurePromo(); // crée le code NASDAS s'il n'existe pas encore
});
