import { useDashboard } from '../store'

export function TopGifters() {
  const { gifters } = useDashboard()
  return (
    <section>
      <h2 className="section-label">Top gifters</h2>
      {gifters.length === 0 ? (
        <p className="text-muted small">No gifts yet.</p>
      ) : (
        <ol className="gifters">
          {gifters.slice(0, 5).map((gifter, i) => (
            <li key={gifter.id} className="gifters__row">
              <span className="gifters__rank">{i + 1}</span>
              <span className="gifters__name">{gifter.nickname}</span>
              <span className="gifters__coins">{gifter.coins.toLocaleString()} coins</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
