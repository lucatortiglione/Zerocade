import { GIFTS, GIFT_TIERS } from '@zerocade/shared'

const coins = new Intl.NumberFormat('it-IT')

export function GiftsPage() {
  return (
    <div className="gifts-page" id="contenuto" tabIndex={-1}>
      <h1>Catalogo dei regali</h1>
      <p className="text-muted">Una selezione del catalogo reale dei regali TikTok, divisa per rarità.</p>
      {GIFT_TIERS.map((tier) => (
        <section key={tier.id}>
          <h2 className="section-label">{tier.label}</h2>
          <ul className="gift-grid">
            {GIFTS.filter((g) => g.tier === tier.id).map((g) => (
              <li key={g.id} className="gift-btn gift-btn--static">
                <span className="gift-btn__emoji" aria-hidden="true">
                  {g.emoji}
                </span>
                <span className="gift-btn__name">{g.name}</span>
                <span className="gift-btn__coins">{coins.format(g.coins)} {g.coins === 1 ? 'moneta' : 'monete'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
