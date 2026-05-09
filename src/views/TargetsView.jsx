import { SectionCard } from '../components.jsx';

export default function TargetsView({ targets, setTargets, folders, setFolders }) {
  const addFolder = () => {
    const id = `fld_${Date.now().toString(36)}`;
    setFolders(prev => [...prev, { id, name: 'New Folder' }]);
  };
  const renameFolder = (id, name) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };
  const deleteFolder = (id) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    if (!window.confirm(`Delete folder "${folder.name}"?\n\nTargets inside will move to Ungrouped.`)) return;
    setFolders(prev => prev.filter(f => f.id !== id));
    setTargets(prev => prev.map(t => t.folderId === id ? { ...t, folderId: undefined } : t));
  };

  const addTarget = (folderId) => {
    const id = `tgt_${Date.now().toString(36)}`;
    setTargets(prev => [...prev, { id, name: '', folderId }]);
  };
  const renameTarget = (id, name) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  };
  const removeTarget = (id) => {
    setTargets(prev => prev.filter(t => t.id !== id));
  };
  const moveTarget = (id, folderId) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, folderId: folderId || undefined } : t));
  };

  // Resolve targets that reference a deleted/missing folder back to ungrouped
  // for display purposes.
  const folderIds = new Set(folders.map(f => f.id));
  const targetsInFolder = (fid) =>
    targets.filter(t => (fid == null ? !folderIds.has(t.folderId) : t.folderId === fid));

  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto mt-4 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-gold text-sm">FOLDERS</h2>
        <button onClick={addFolder}
                className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition">
          + new folder
        </button>
      </div>
      <div className="divider" />

      {folders.map(f => (
        <FolderCard
          key={f.id}
          folder={f}
          targets={targetsInFolder(f.id)}
          allFolders={folders}
          onRename={(name) => renameFolder(f.id, name)}
          onDelete={() => deleteFolder(f.id)}
          onAddTarget={() => addTarget(f.id)}
          onRenameTarget={renameTarget}
          onRemoveTarget={removeTarget}
          onMoveTarget={moveTarget}
        />
      ))}

      <UngroupedCard
        targets={targetsInFolder(null)}
        allFolders={folders}
        onAddTarget={() => addTarget(undefined)}
        onRenameTarget={renameTarget}
        onRemoveTarget={removeTarget}
        onMoveTarget={moveTarget}
      />

      {folders.length === 0 && targets.length === 0 && (
        <div className="text-fade italic text-sm text-center py-8">
          empty — click <span className="text-gold">+ new folder</span> to start, or just add ungrouped targets below
        </div>
      )}
    </main>
  );
}

function FolderCard({ folder, targets, allFolders, onRename, onDelete, onAddTarget, onRenameTarget, onRemoveTarget, onMoveTarget }) {
  return (
    <section className="bg-card border border-gold rounded-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          className="lined font-display uppercase tracking-wider text-gold flex-1"
          value={folder.name}
          onChange={e => onRename(e.target.value)}
        />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onAddTarget}
                  className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm">
            + add target
          </button>
          <button onClick={onDelete}
                  className="text-xs font-cmd text-crimson border border-crimson px-2 py-0.5 hover:bg-active rounded-sm">
            ✕ delete
          </button>
        </div>
      </div>
      <TargetList
        targets={targets}
        allFolders={allFolders}
        currentFolderId={folder.id}
        emptyHint="no targets in this folder yet"
        onRenameTarget={onRenameTarget}
        onRemoveTarget={onRemoveTarget}
        onMoveTarget={onMoveTarget}
      />
    </section>
  );
}

function UngroupedCard({ targets, allFolders, onAddTarget, onRenameTarget, onRemoveTarget, onMoveTarget }) {
  return (
    <SectionCard
      title="Ungrouped"
      right={
        <button onClick={onAddTarget}
                className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm">
          + add target
        </button>
      }
    >
      <TargetList
        targets={targets}
        allFolders={allFolders}
        currentFolderId={null}
        emptyHint="no ungrouped targets"
        onRenameTarget={onRenameTarget}
        onRemoveTarget={onRemoveTarget}
        onMoveTarget={onMoveTarget}
      />
    </SectionCard>
  );
}

function TargetList({ targets, allFolders, currentFolderId, emptyHint, onRenameTarget, onRemoveTarget, onMoveTarget }) {
  if (targets.length === 0) {
    return <div className="text-fade italic text-sm py-2">{emptyHint}</div>;
  }
  return (
    <div className="space-y-2">
      {targets.map(t => (
        <div key={t.id} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1.5">
          <input
            className="lined flex-1 font-cmd"
            placeholder="target name"
            value={t.name}
            onChange={e => onRenameTarget(t.id, e.target.value)}
          />
          <select
            className="lined"
            value={currentFolderId || ''}
            onChange={e => onMoveTarget(t.id, e.target.value || null)}
            title="move to folder"
          >
            <option value="">(ungrouped)</option>
            {allFolders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button onClick={() => onRemoveTarget(t.id)}
                  className="text-fade hover:text-crimson text-sm">✕</button>
        </div>
      ))}
    </div>
  );
}
