// Bestiary — DM mode's analogue of the character vault. Holds imported
// monster stat blocks; an "active" checkbox on each card surfaces it on
// the DM Roll page for an encounter.
//
// Slice 1: empty-state placeholder + page chrome. Slices 2+ add cards,
// folders, the "active" toggle, and the 5e.tools importer.

export default function BestiaryView() {
  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto mt-4">
      <div className="border border-gold rounded-sm p-8 text-center bg-card">
        <div className="font-display text-gold text-lg uppercase tracking-wider mb-2">
          Bestiary
        </div>
        <p className="text-fade italic text-sm max-w-xl mx-auto">
          The bestiary is where imported monster stat blocks live. Coming next:
          5e.tools URL import, folder organization, an "active" toggle to
          surface a monster on the DM Roll page for combat, and clickable
          attack buttons that compose Avrae commands.
        </p>
      </div>
    </main>
  );
}
