import React from 'react';

const articles = [
  {
    href: '/analyse-geopolitique-dubai',
    title: 'Conflit Moyen-Orient & immobilier Dubaï 2026',
    desc: 'Impact géopolitique semaine par semaine sur les prix et transactions',
  },
  {
    href: '/guide-visa-or-dubai',
    title: 'Guide complet : Visa Or Dubaï (Golden Visa)',
    desc: 'Conditions, coûts et démarches pour obtenir la résidence aux EAU',
  },
  {
    href: '/meilleurs-quartiers-dubai-investissement',
    title: 'Meilleurs quartiers de Dubaï pour investir en 2026',
    desc: 'Comparatif rendement, valorisation et risque par district',
  },
];

const Footer: React.FC = () => (
  <footer
    style={{
      background: 'rgba(5,5,5,0.97)',
      borderTop: '1px solid rgba(212,175,55,0.12)',
      padding: '48px 24px 32px',
      marginTop: '80px',
    }}
  >
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, marginBottom: 48 }}>

        {/* Brand */}
        <div>
          <img src="/logo.png" alt="DubaiInvest" style={{ height: 56, marginBottom: 16 }} />
          <p style={{ color: 'rgba(180,170,155,0.7)', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
            Plateforme IA d'analyse et de simulation pour investisseurs immobiliers francophones à Dubaï.
          </p>
        </div>

        {/* Articles */}
        <div>
          <h3 style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            Analyses & Guides
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {articles.map(a => (
              <li key={a.href}>
                <a
                  href={a.href}
                  style={{ color: 'rgba(240,235,224,0.8)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,235,224,0.8)')}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>{a.title}</span>
                  <span style={{ color: 'rgba(180,170,155,0.55)', fontSize: 11 }}>{a.desc}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Simulateur */}
        <div>
          <h3 style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            Simulateur Gratuit
          </h3>
          <p style={{ color: 'rgba(180,170,155,0.7)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            Calculez votre rendement locatif, comparez les quartiers et obtenez une analyse IA personnalisée en 2 minutes.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.35)',
              color: '#D4AF37',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Simuler mon investissement →
          </a>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <p style={{ color: 'rgba(180,170,155,0.4)', fontSize: 11 }}>
          © 2026 DubaiInvest AI Advisor — Conseil en investissement immobilier à Dubaï pour investisseurs francophones
        </p>
        <p style={{ color: 'rgba(180,170,155,0.3)', fontSize: 11 }}>
          Les informations fournies sont à titre indicatif et ne constituent pas un conseil financier.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
