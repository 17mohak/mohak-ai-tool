import * as React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";

interface EntityCardProps {
  title: string;
  count: number;
  icon: React.ElementType;
  items: Array<{ id: any; name: string }>;
  onAdd: () => void;
  onViewAll: () => void;
  isLoading?: boolean;
}

export function EntityCard({ title, count, icon: Icon, items, onAdd, onViewAll, isLoading }: EntityCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", bounce: 0.3 }}
    >
      <Card className="h-full flex flex-col group relative overflow-hidden">
        {/* Subtle gradient hover effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-transparent to-violet-500/0 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
        
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-700/50 rounded-xl">
              <Icon className="h-5 w-5 text-indigo-400" />
            </div>
            <CardTitle className="text-xl text-slate-100">{title}</CardTitle>
          </div>
          <span className="text-2xl font-bold text-slate-200">{isLoading ? "-" : count}</span>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col justify-between pt-4">
          <div className="space-y-3 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent</p>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-slate-700/30 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                <p className="text-sm">No {title.toLowerCase()} yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-900/40 border border-slate-700/50">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    <span className="text-sm font-medium text-slate-300 truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-700/50">
            <Button variant="primary" className="flex-1 gap-2" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              Add New
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onViewAll}>
              View All
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
