import os
import re

filepath = r'c:\Users\MOHAK\mohak-ai-tool\frontend\src\app\(dashboard)\scheduler\page.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Left Sidebar Width constraint to max-w-[300px]
# Old: className="w-[30%] min-w-[320px] max-w-[380px] flex flex-col gap-3 shrink-0 h-full"
content = re.sub(
    r'w-\[30%\] min-w-\[320px\] max-w-\[380px\]',
    r'w-[30%] min-w-[280px] max-w-[300px]',
    content
)

# 2. Add Select a variant / No slots fallback & genIssues structured card
old_center_empty = r'''          {!selectedRunId ? (
            <div className="flex-1 flex items-center justify-center bg-slate-900/30 relative">
               <div className="absolute inset-0 bg-\[radial-gradient\(ellipse_at_center,_var\(--tw-gradient-stops\)\)\] from-indigo-900/10 via-slate-900/20 to-transparent"></div>
              <button onClick={handleGenerate} disabled={generating || !selectedDeptName} 
                className="group z-10 flex flex-col items-center gap-4 p-8 rounded-2xl cursor-pointer hover:bg-indigo-500/5 transition-all text-center">
                <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 group-hover:shadow-\[0_0_30px_rgba\(99,102,241,0.2\)\] transition-all duration-500 relative">
                  {generating \? \(
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="w-8 h-8 border-\[3px\] border-indigo-500 border-t-transparent rounded-full shadow-\[0_0_15px_rgba\(99,102,241,0.5\)\]"/>
                  \) : \(
                    <span className="text-3xl plugin-icon opacity-80 group-hover:opacity-100 transition-opacity">⚡</span>
                  \)}
                  <div className="absolute inset-0 rounded-full bg-indigo-500/5 filter blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </div>
                <div>
                  <p className="text-slate-200 font-bold text-\[14px\] group-hover:text-indigo-300 transition-colors uppercase tracking-widest">
                    {generating \? "Synthesizing Constraints" : "\[ Generate Schedule \]"}
                  </p>
                  <p className="text-slate-500 text-\[11px\] font-medium mt-1.5 group-hover:text-slate-400 max-w-\[200px\] leading-relaxed transition-colors">Invoke AI constraint solver to create collision-free schedules automatically</p>
                </div>
              </button>
            </div>
          \) : \('''

new_center_empty = '''          {!selectedRunId ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/30 relative p-8">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-900/20 to-transparent"></div>
              
              {genIssues && genIssues.length > 0 ? (
                <div className="z-10 bg-slate-800/80 border border-red-500/40 rounded-lg p-5 max-w-md w-full shadow-2xl backdrop-blur">
                  <h3 className="text-red-400 font-bold uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
                    <span className="text-lg">⚠️</span> Impossible Constraints
                  </h3>
                  <div className="space-y-2 mb-4 text-xs">
                    <div className="flex justify-between bg-slate-900/50 p-2 rounded"><span className="text-slate-400">Batch</span><span className="text-slate-200 font-bold">{genIssues[0].batch}</span></div>
                    <div className="flex justify-between bg-slate-900/50 p-2 rounded"><span className="text-slate-400">Required</span><span className="text-amber-400 font-bold">{genIssues[0].required} slots</span></div>
                    <div className="flex justify-between bg-slate-900/50 p-2 rounded"><span className="text-slate-400">Available</span><span className="text-emerald-400 font-bold">{genIssues[0].available} slots</span></div>
                    <div className="flex justify-between bg-slate-900/50 p-2 border-t border-slate-700 mt-1"><span className="text-slate-400">Reason</span><span className="text-red-300 font-semibold">{genIssues[0].reason}</span></div>
                  </div>
                  <p className="text-slate-400 text-[11px] text-center mb-4">Try reducing subjects for this batch, or removing pinned/unavailable constraints to increase available slots.</p>
                  <button onClick={() => setGenIssues(null)} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors">Acknowledge</button>
                </div>
              ) : runs.length > 0 ? (
                <div className="z-10 text-center flex flex-col items-center">
                  <span className="text-4xl mb-4 grayscale opacity-50 block">🗂️</span>
                  <p className="text-slate-300 font-bold text-[14px] uppercase tracking-widest mb-2">Select a generated variant</p>
                  <p className="text-slate-500 text-[11px]">Choose a variant from the bottom toolbar to preview the timetable.</p>
                </div>
              ) : (
                <button onClick={handleGenerate} disabled={generating || !selectedDeptName} 
                  className="group z-10 flex flex-col items-center gap-4 p-8 rounded-2xl cursor-pointer hover:bg-indigo-500/5 transition-all text-center">
                  <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] transition-all duration-500 relative">
                    {generating ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="w-8 h-8 border-[3px] border-indigo-500 border-t-transparent rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"/>
                    ) : (
                      <span className="text-3xl plugin-icon opacity-80 group-hover:opacity-100 transition-opacity">⚡</span>
                    )}
                    <div className="absolute inset-0 rounded-full bg-indigo-500/5 filter blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  </div>
                  <div>
                    <p className="text-slate-200 font-bold text-[14px] group-hover:text-indigo-300 transition-colors uppercase tracking-widest">
                      {generating ? (generationStep || "Processing") : "[ Generate Schedule ]"}
                    </p>
                    <p className="text-slate-500 text-[11px] font-medium mt-1.5 group-hover:text-slate-400 max-w-[200px] leading-relaxed transition-colors">Invoke AI solver to create collision-free schedules automatically</p>
                  </div>
                </button>
              )}
            </div>
          ) : gridSlots.length === 0 && !gridLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/30 relative">
              <span className="text-4xl mb-4 grayscale opacity-50 block">🗓️</span>
              <p className="text-slate-300 font-bold text-[14px] uppercase tracking-widest mb-2">No slots generated</p>
              <p className="text-slate-500 text-[11px]">This variant was processed but produced no valid schedule blocks.</p>
            </div>
          ) : ('''

content = re.sub(old_center_empty, new_center_empty.replace('\\', '\\\\'), content)

# 3. Handle Timetable Grid slots colors and tooltips
# Replace e.is_lab logic with hash
old_slot_render = r'''                                    <motion.div 
                                      layout layoutId={String\(e.id\)} key={e.id} 
                                      draggable={!pinned}
                                      onDragStart={\(ev: any\) => handleDragStart\(ev, e, day, ts.index\)}
                                      onDragEnd={handleDragEnd}
                                      className={`rounded pt-1.5 pb-2 px-2.5 text-left border cursor-move transition-all flex-shrink-0 relative overflow-hidden group \$\{
                                        e.is_lab
                                          \? "bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/30 hover:border-purple-400/60"
                                          : "bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border-indigo-500/30 hover:border-indigo-400/60"
                                      \} \$\{pinned \? "opacity-75 cursor-not-allowed" : "hover:shadow-\[0_4px_12px_rgba\(0,0,0,0.1\)\] hover:-translate-y-0.5"\} \$\{
                                        isOverloaded && !dragState.slot \? "ring-1 ring-orange-500 shadow-\[0_0_15px_rgba\(249,115,22,0.15\)\]" : ""
                                      \} \$\{
                                        dragState.slot\?.id === e.id \? "opacity-30 scale-\[0.98\]" : ""
                                      \}`}
                                    >'''

new_slot_render = '''                                    <motion.div 
                                      layout layoutId={String(e.id)} key={e.id} 
                                      draggable={!pinned}
                                      onDragStart={(ev: any) => handleDragStart(ev, e, day, ts.index)}
                                      onDragEnd={handleDragEnd}
                                      title={`${e.subject} • ${e.teacher} • ${e.batch}`}
                                      className={`rounded pt-1.5 pb-2 px-2.5 text-left border cursor-move transition-all flex-shrink-0 relative overflow-hidden group ${
                                        ["indigo", "emerald", "amber", "cyan", "purple", "rose"][(e.teacher_id || 0) % 6] === "indigo" ? "bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border-indigo-500/30 hover:border-indigo-400/60" :
                                        ["indigo", "emerald", "amber", "cyan", "purple", "rose"][(e.teacher_id || 0) % 6] === "emerald" ? "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/30 hover:border-emerald-400/60" :
                                        ["indigo", "emerald", "amber", "cyan", "purple", "rose"][(e.teacher_id || 0) % 6] === "amber" ? "bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30 hover:border-amber-400/60" :
                                        ["indigo", "emerald", "amber", "cyan", "purple", "rose"][(e.teacher_id || 0) % 6] === "cyan" ? "bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/30 hover:border-cyan-400/60" :
                                        ["indigo", "emerald", "amber", "cyan", "purple", "rose"][(e.teacher_id || 0) % 6] === "purple" ? "bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/30 hover:border-purple-400/60" :
                                        "bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/30 hover:border-rose-400/60"
                                      } ${pinned ? "opacity-75 cursor-not-allowed" : "hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:-translate-y-0.5"} ${
                                        isOverloaded && !dragState.slot ? "ring-1 ring-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)]" : ""
                                      } ${
                                        dragState.slot?.id === e.id ? "opacity-30 scale-[0.98]" : ""
                                      }`}
                                    >'''

content = re.sub(old_slot_render, new_slot_render.replace('\\', '\\\\'), content, count=1)


# 4. Modify subject list rendering for strictly single row truncation inside LEFT SIDEBAR
old_sub_render = r'''                  <div key={s.id} 
                    draggable={true}
                    onDragStart={\(e\) => handleSubjectDragStart\(e, s\)}
                    onDragEnd={handleDragEnd}
                    className="bg-slate-900/40 rounded px-2.5 py-2 border border-slate-700/50 cursor-grab hover:bg-slate-700/40 hover:border-indigo-500/30 transition-all flex flex-col gap-1.5 shadow-sm group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200 truncate flex-1 group-hover:text-indigo-300 transition-colors">{s.name}</span>
                      <span className="flex gap-1.5 overflow-hidden justify-end">
                        {s.batch_name && <span className="text-\[9px\] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 rounded whitespace-nowrap border border-indigo-500/20 font-medium truncate max-w-16">{s.batch_name}</span>}
                        {s.teacher_name && <span className="text-\[9px\] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 rounded whitespace-nowrap border border-emerald-500/20 font-medium truncate max-w-16">{s.teacher_name}</span>}
                        <span className="text-\[9px\] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded whitespace-nowrap border border-amber-500/20 shrink-0">
                          {s.credits - gridSlots.filter\(g => g.subject_id === s.id\).length} left
                        </span>
                      </span>
                    </div>
                  </div>'''

new_sub_render = '''                  <div key={s.id} 
                    draggable={true}
                    onDragStart={(e) => handleSubjectDragStart(e, s)}
                    onDragEnd={handleDragEnd}
                    className="bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-700/50 cursor-grab hover:bg-slate-700/40 hover:border-indigo-500/30 transition-all flex items-center justify-between gap-2 shadow-sm group overflow-hidden"
                  >
                    <span className="text-[11px] font-bold text-slate-200 truncate flex-[2] group-hover:text-indigo-300 transition-colors" title={s.name}>{s.name}</span>
                    <div className="flex gap-1 items-center shrink-0">
                      {s.batch_name && <span className="text-[9px] px-1 py-0.5 bg-indigo-500/10 text-indigo-300 rounded border border-indigo-500/20 font-medium truncate max-w-[45px] leading-none" title={s.batch_name}>{s.batch_name}</span>}
                      {s.teacher_name && <span className="text-[9px] px-1 py-0.5 bg-emerald-500/10 text-emerald-300 rounded border border-emerald-500/20 font-medium truncate max-w-[45px] leading-none" title={s.teacher_name}>{s.teacher_name.split(' ')[0]}</span>}
                      <span className="text-[9px] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shadow-inner leading-none" title={`${s.credits - gridSlots.filter(g => g.subject_id === s.id).length} slots remaining`}>
                        {s.credits - gridSlots.filter(g => g.subject_id === s.id).length} left
                      </span>
                    </div>
                  </div>'''

content = re.sub(old_sub_render, new_sub_render.replace('\\', '\\\\'), content, count=1)


# 5. Connect AI Input in handleAiSubmit logic
# We need an explicit handleAiSubmit function, but we can inject a quick closure
old_ai_box = r'''                {selectedRunId \? \(
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <button onClick={\(\) => handleAiAction\("optimize"\)} disabled={aiWorking} className="px-3.5 py-2.5 bg-slate-900/40 hover:bg-indigo-600 text-\[11px\] font-semibold text-slate-300 hover:text-white rounded border border-slate-700/50 hover:border-indigo-500 transition-all text-left flex justify-between items-center group">'''

new_ai_box = '''                {selectedRunId ? (
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <div className="mb-2 w-full flex bg-slate-900/40 border border-slate-700/50 rounded overflow-hidden shadow-inner focus-within:border-indigo-500/50">
                      <input 
                        type="text" 
                        placeholder="Type command..." 
                        value={aiCommand}
                        onChange={e => setAiCommand(e.target.value)}
                        onKeyDown={e => {
                           if (e.key === 'Enter' && aiCommand.trim()) {
                             const cmd = aiCommand;
                             setAiCommand("");
                             setAiLogs(l => [`>${cmd}`, ...l].slice(0,5));
                             handleAiAction("custom", { command: cmd }); // Uses internal generic handleAiAction
                           }
                        }}
                        className="w-full bg-transparent px-2.5 py-2 text-[11px] text-slate-200 outline-none" 
                        disabled={aiWorking} />
                    </div>
                    {aiLogs.length > 0 && (
                      <div className="mb-2 max-h-24 overflow-y-auto custom-scrollbar space-y-1 bg-slate-900/60 p-2 rounded text-[10px] text-slate-400 font-mono tracking-tight leading-loose shadow-inner border border-slate-700/30">
                        {aiLogs.map((log, i) => <div key={i} className="truncate border-b border-slate-700/30 pb-0.5 mb-0.5 last:border-0 last:mb-0 last:pb-0">{log}</div>)}
                      </div>
                    )}
                    <button onClick={() => handleAiAction("optimize")} disabled={aiWorking} className="px-3.5 py-2.5 bg-slate-900/40 hover:bg-indigo-600 text-[11px] font-semibold text-slate-300 hover:text-white rounded border border-slate-700/50 hover:border-indigo-500 transition-all text-left flex justify-between items-center group">'''

content = re.sub(old_ai_box, new_ai_box.replace('\\', '\\\\'), content, count=1)


# 6. Make handleAiAction refreshState after success
# But we need to use string replacement precisely. Let's find handleAiAction
old_ai_handler_end = r'''      setTimeout\(\(\) => {
        setAiDiff\(null\);
        setGridSlots\(slots\); // Optimistically set, or let useEffect handle
      }, 2000\);

    } catch \(err\) {'''

new_ai_handler_end = '''      setTimeout(() => {
        setAiDiff(null);
        hasFetchedGrid.current = false;
        refreshState(); // Sync up updated slots securely
      }, 2000);
      
      // Push semantic log
      const resData = (res as any);
      if (resData?.ops) setAiLogs(l => [...(resData.ops || []), ...l].slice(0,5));
      else setAiLogs(l => [`Action ${action} successful`, ...l].slice(0,5));

    } catch (err) {'''

content = re.sub(old_ai_handler_end, new_ai_handler_end.replace('\\', '\\\\'), content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated JSX natively successfully.")
