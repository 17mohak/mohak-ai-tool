  const COLOR_MAP: Record<string, string> = {
    "blue": "bg-blue-500/20 border-blue-500/50 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.2)]",
    "emerald": "bg-emerald-500/20 border-emerald-500/50 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)]",
    "amber": "bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]",
    "rose": "bg-rose-500/20 border-rose-500/50 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.2)]",
    "cyan": "bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.2)]",
    "violet": "bg-violet-500/20 border-violet-500/50 text-violet-200 shadow-[0_0_15px_rgba(139,92,246,0.2)]",
  };
  const TEACHER_COLORS = ["blue", "emerald", "violet", "amber", "rose", "cyan"];
  const getTeacherColorClass = (teacherId: number) => {
    const colorIndex = Math.abs(teacherId || 0) % TEACHER_COLORS.length;
    return COLOR_MAP[TEACHER_COLORS[colorIndex]];
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] relative overflow-hidden bg-[#0c0e12] font-inter text-slate-200">
      <AnimatedBackground />

      {/* Top Main Area */}
      <div className="flex flex-1 gap-6 p-6 z-10 overflow-hidden backdrop-blur-sm">
        
        {/* ═══ LEFT SIDEBAR (Controls & Tabs) ═══ */}
        <div className="w-[320px] flex flex-col gap-4 shrink-0 h-full">
          
          {/* Controls Panel (One Card) */}
          <div className="bg-[#111318]/60 border border-white/5 backdrop-blur-xl rounded-2xl flex flex-col shrink-0 shadow-2xl overflow-visible">
            {/* Dept and Batch Row */}
            <div className="p-4 border-b border-white/5 flex gap-3 z-10">
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] items-center gap-1.5 uppercase font-bold text-[#8ff5ff] mb-1.5 flex tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#primary]" /> Dept
                </label>
                <select
                  value={selectedDeptName}
                  onChange={e => setSelectedDeptName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c0e12]/80 border border-white/10 rounded-lg text-slate-200 text-xs focus:ring-1 focus:ring-[#8ff5ff]/50 hover:bg-[#171a1f] outline-none truncate transition-all shadow-inner"
                >
                  {deptList.length === 0 ? <option value="">No depts</option> : deptList.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] items-center gap-1.5 uppercase font-bold text-[#8ff5ff] mb-1.5 flex tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c180ff]" /> Batch
                </label>
                <select
                  value={selectedBatchId ?? ""}
                  onChange={e => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 bg-[#0c0e12]/80 border border-white/10 rounded-lg text-slate-200 text-xs focus:ring-1 focus:ring-[#8ff5ff]/50 hover:bg-[#171a1f] outline-none truncate transition-all shadow-inner"
                >
                  <option value="">All Batches</option>
                  {buildBatchTree.length > 0 ? renderBatchOptions(buildBatchTree) : state?.batches.map(b => (
                    <option key={b.id} value={b.id}>{b.parent_batch_id ? "↳ " : ""}{b.name} ({b.size})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Collapsible Pins */}
            <div>
              <button onClick={() => setPinsOpen(!pinsOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-[#aaabb0] hover:text-[#f6f6fc] hover:bg-white/5 transition-colors rounded-b-2xl">
                <span className="flex items-center gap-2"><span className="text-lg">📌</span> Pinned Slots ({state?.pinned_slots.length || 0})</span>
                <span className={`transform transition-transform ${pinsOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {pinsOpen && (
                <div className="px-4 pb-4 bg-black/20 pt-2 border-t border-white/5 shadow-inner rounded-b-2xl">
                  {/* Pin Content - Simple version to save space */}
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                    {state?.pinned_slots.map(p => (
                      <div key={p.id} className="flex justify-between bg-[#171a1f] rounded-lg p-2 text-[10px] border border-white/5 hover:border-white/10">
                        <span className="truncate w-3/4"><span className="font-bold">{p.subject_name}</span> <span className="text-[#aaabb0]">• {DAY_SHORT[p.day]} S{p.slot_index}</span></span>
                        <button onClick={() => handleDeletePin(p.id)} className="text-[#ff716c] hover:bg-[#ff716c]/20 w-5 h-5 rounded transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subjects/Faculty Tabs Card */}
          <div className="bg-[#111318]/60 border border-white/5 backdrop-blur-xl rounded-2xl flex flex-col flex-1 overflow-hidden shadow-2xl relative">
            <div className="flex border-b border-white/5 bg-[#0c0e12]/40 shrink-0">
              {(["subjects", "faculty", "unavailability"] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 px-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    tab === t ? "text-[#8ff5ff] bg-white/5 shadow-[inset_0_-2px_0_#8ff5ff]" : "text-[#aaabb0] hover:text-[#f6f6fc] hover:bg-white/5"
                  }`}>
                  {t === "unavailability" ? "Unavail." : t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar relative">
              {tab === "subjects" && (
                unassignedSubjects.length ? unassignedSubjects.map(s => (
                  <motion.div key={s.id} 
                    draggable={true}
                    onDragStart={(e: any) => handleSubjectDragStart(e, s)}
                    onDragEnd={handleDragEnd}
                    whileHover={{ scale: 1.02 }}
                    className="bg-[#171a1f]/80 rounded-xl px-3 py-2.5 border border-white/5 cursor-grab active:cursor-grabbing hover:bg-[#23262c] hover:border-[#8ff5ff]/30 transition-all flex flex-col gap-1 shadow-md group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <div className="flex items-center justify-between">
                       <span className="text-xs font-bold text-[#f6f6fc] truncate group-hover:text-[#8ff5ff] transition-colors">{s.name}</span>
                       <span className="text-[9px] text-amber-300 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                         {s.credits - gridSlots.filter(g => g.subject_id === s.id).length} Req
                       </span>
                    </div>
                    <div className="flex gap-2">
                      {s.batch_name && <span className="text-[9px] text-[#c180ff] font-medium truncate">{s.batch_name}</span>}
                      {s.teacher_name && <span className="text-[9px] text-[#aaabb0] font-medium truncate">• {s.teacher_name}</span>}
                    </div>
                  </motion.div>
                )) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[#9bffce]/80 p-4">
                    <motion.span animate={{ scale: [1,1.1,1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-3xl mb-2 drop-shadow-[0_0_15px_rgba(155,255,206,0.5)]">✨</motion.span>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#9bffce]">All Allocated</p>
                  </div>
                )
              )}

              {tab === "faculty" && (
                filteredFaculty.length ? filteredFaculty.map(t => (
                  <div key={t.id} className="bg-[#171a1f]/80 rounded-xl px-3 py-2.5 border border-white/5 flex justify-between items-center hover:border-white/10 transition-colors shadow-sm">
                     <span className="text-xs font-bold text-[#f6f6fc] truncate">{t.name}</span>
                     <span className="text-[9px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-[#aaabb0] font-medium">Max {t.max_classes_per_day}</span>
                  </div>
                )) : <p className="text-xs text-[#aaabb0] text-center py-8">No faculty found</p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ CENTER MAIN FOCUS (Timetable Grid) ═══ */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0e12]/60 rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden relative backdrop-blur-2xl">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 bg-[#171a1f]/40 flex items-center justify-between shrink-0 h-[60px] backdrop-blur-md">
            <div className="flex items-center gap-4">
              <h2 className="font-space-grotesk font-bold text-[#f6f6fc] text-[14px] tracking-widest uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#8ff5ff] shadow-[0_0_10px_#8ff5ff]"></span>
                Ethereal Grid
                {selectedRunId && <span className="text-[#c180ff] font-bold ml-2 bg-[#c180ff]/10 border border-[#c180ff]/20 px-2 py-0.5 rounded-full text-[10px] tracking-normal shadow-[0_0_10px_rgba(193,128,255,0.2)]">V{selectedRunId}</span>}
              </h2>
              {dragState.slot && (
                <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                  Moving {dragState.slot.subject}
                </motion.span>
              )}
            </div>
            {gridLoading && <span className="text-[10px] text-[#8ff5ff] font-bold animate-pulse tracking-widest uppercase">Syncing...</span>}
          </div>

          {!selectedRunId ? (
            <div className="flex-1 flex flex-col items-center justify-center relative">
               <motion.button 
                 onClick={handleGenerate}
                 disabled={generating || !selectedDeptName}
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 className="relative group p-8 rounded-3xl z-20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#9c48ea]/30 to-[#00deec]/30 rounded-[3rem] blur-2xl group-hover:blur-3xl transition-all duration-500" />
                  <div className="relative bg-[#111318]/90 border border-white/10 backdrop-blur-3xl rounded-[2.5rem] p-12 flex flex-col items-center shadow-2xl overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                     {generating ? (
                        <div className="flex flex-col items-center gap-6">
                           <motion.div 
                             animate={{ rotate: 360 }} 
                             transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                             className="w-16 h-16 border-4 border-[#8ff5ff] border-t-transparent rounded-full drop-shadow-[0_0_15px_rgba(143,245,255,1)]"
                           />
                           <motion.div 
                             initial={{ opacity: 0, y: 10 }}
                             animate={{ opacity: 1, y: 0 }}
                             key={generationStep}
                             className="font-space-grotesk font-bold text-xl text-[#8ff5ff] uppercase tracking-widest drop-shadow-[0_0_10px_rgba(143,245,255,0.5)]"
                           >
                              {generationStep || "Validating..."}
                           </motion.div>
                        </div>
                     ) : (
                        <div className="flex flex-col items-center gap-4">
                           <motion.span 
                             animate={{ scale: [1, 1.1, 1] }} 
                             transition={{ duration: 2, repeat: Infinity }}
                             className="text-6xl drop-shadow-[0_0_20px_rgba(143,245,255,0.8)]"
                           >
                             ⚡
                           </motion.span>
                           <span className="font-space-grotesk text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8ff5ff] to-[#c180ff] tracking-wide shrink-0 whitespace-nowrap px-4 py-2">
                              Generate a Smart Schedule
                           </span>
                        </div>
                     )}
                  </div>
               </motion.button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto custom-scrollbar p-6">
               <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr_1fr] gap-3 h-full pb-8">
                  {/* Headers */}
                  <div />
                  {DAYS.map(d => (
                     <div key={d} className="flex justify-center items-end pb-3 text-[11px] font-space-grotesk font-bold text-[#aaabb0] uppercase tracking-widest border-b border-light/5">
                        {DAY_SHORT[d]}
                     </div>
                  ))}
                  
                  {/* Rows */}
                  {TIME_SLOTS.map(ts => {
                     const isBreak = ts.is_break;
                     const isWednesdayElective = (day: string) => day === "WEDNESDAY" && WEDNESDAY_ELECTIVE_SLOTS.includes(ts.index);
                     
                     return (
                        <React.Fragment key={ts.index}>
                           <div className="flex flex-col items-center justify-center pt-2">
                              <span className="text-[10px] font-medium text-[#aaabb0] bg-white/5 px-2 py-1 rounded-full border border-white/5">{ts.start_time}</span>
                           </div>
                           {DAYS.map(day => {
                              const entries = getCell(day, ts.index);
                              const isDragOver = draggedOverCell?.day === day && draggedOverCell?.slotIndex === ts.index;
                              const isWedElective = isWednesdayElective(day);
                              
                              let cellClasses = "relative rounded-[1.25rem] p-2 transition-all duration-300 flex flex-col gap-2 min-h-[100px] border border-transparent ";
                              if (isBreak) cellClasses += "bg-[#111318]/40 border-white/5 opacity-50 ";
                              else if (isWedElective) cellClasses += "bg-[#005a3c]/10 border-[#006443]/30 ";
                              else if (isDragOver) cellClasses += draggedOverCell?.valid ? "bg-[#69f6b8]/20 border-[#69f6b8]/50 shadow-[0_0_20px_rgba(105,246,184,0.2)] " : "bg-[#ff716c]/20 border-[#ff716c]/50 ";
                              else cellClasses += "bg-[#171a1f]/60 hover:bg-[#23262c]/80 hover:border-white/10 hover:shadow-xl ";
                              
                              return (
                                 <div 
                                    key={`${day}-${ts.index}`}
                                    className={cellClasses}
                                    onDragOver={(e: any) => !isBreak && !isWedElective && handleDragOver(e, day, ts.index)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e: any) => !isBreak && !isWedElective && handleDrop(e, day, ts.index)}
                                 >
                                    {isBreak && <div className="absolute inset-0 flex items-center justify-center font-bold text-[10px] text-[#aaabb0] tracking-[0.2em] uppercase mix-blend-overlay">Break</div>}
                                    {isWedElective && <div className="absolute inset-0 flex items-center justify-center font-bold text-[9px] text-[#58e7ab] tracking-widest uppercase text-center opacity-40">Elective<br/>Locked</div>}
                                    
                                    <AnimatePresence>
                                       {entries.map(e => (
                                          <motion.div 
                                             layoutId={String(`slot-${e.id}`)}
                                             initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                             animate={{ opacity: 1, scale: 1, y: 0 }}
                                             exit={{ opacity: 0, scale: 0.9 }}
                                             whileHover={{ scale: 1.04, y: -2 }}
                                             className={`relative flex flex-col p-3 rounded-xl border backdrop-blur-2xl cursor-grab active:cursor-grabbing overflow-hidden ${getTeacherColorClass(e.teacher_id)}`}
                                             draggable
                                             onDragStart={(evt: any) => handleDragStart(evt, e, day, ts.index)}
                                             key={e.id}
                                          >
                                             <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                             <span className="font-space-grotesk font-bold text-xs truncate z-10 leading-tight">{e.subject}</span>
                                             <span className="text-[10px] opacity-80 mt-1 truncate z-10">{e.teacher}</span>
                                             <span className="text-[9px] uppercase tracking-widest opacity-60 mt-2 z-10 font-bold bg-black/20 self-start px-2 py-0.5 rounded-full">{e.batch}</span>
                                          </motion.div>
                                       ))}
                                    </AnimatePresence>
                                 </div>
                              );
                           })}
                        </React.Fragment>
                     );
                  })}
               </div>
            </div>
          )}
          
          {/* AI OPERATOR BOTTOM BAR (HUD) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[80%] max-w-[800px] z-50">
             <div className="bg-[#111318]/90 border border-white/10 backdrop-blur-3xl p-3 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2">
               
               {/* Activity Log (Mini) */}
               {aiLogs.length > 0 && (
                 <div className="px-4 py-2 border-b border-white/5 max-h-20 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                    {aiLogs.slice(-3).map((log, idx) => (
                       <motion.div initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} key={idx} className={`text-[10px] font-mono flex items-center gap-2 ${log.includes("✓") ? "text-[#9bffce]" : log.includes("✗") ? "text-[#ff716c]" : "text-[#aaabb0]"}`}>
                          {log}
                       </motion.div>
                    ))}
                 </div>
               )}

               <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8ff5ff] to-[#c180ff] flex items-center justify-center shadow-[0_0_15px_rgba(143,245,255,0.4)] shrink-0">
                     <span className="text-sm shadow-inner">🪄</span>
                  </div>
                  <input
                     type="text"
                     value={aiInput}
                     onChange={(e) => setAiInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleAiCustomAction()}
                     placeholder="Command the AI (e.g., 'Optimize layout', 'Move ML to Monday 1st slot')..."
                     disabled={aiWorking}
                     className="flex-1 bg-transparent border-none outline-none text-[#f6f6fc] text-sm placeholder:text-[#53555a] placeholder:font-medium font-inter h-10 px-2"
                  />
                  {aiWorking ? (
                     <div className="w-6 h-6 border-2 border-[#8ff5ff] border-t-transparent rounded-full animate-spin shrink-0 mr-2" />
                  ) : (
                     <button
                        onClick={handleAiCustomAction}
                        disabled={!aiInput.trim()}
                        className="px-5 py-2 bg-white/10 hover:bg-[#8ff5ff]/20 text-[#8ff5ff] rounded-full text-xs font-bold transition-all disabled:opacity-30 tracking-widest uppercase border border-white/5 hover:border-[#8ff5ff]/50"
                     >
                        Execute
                     </button>
                  )}
               </div>
             </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
}
