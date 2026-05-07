import { useEffect, useState } from 'react';
import { GraduationCap, Star, TrendingUp, Award, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface GradeEntry {
  id: string;
  file_name: string;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
  assignments: { title: string; document_type: string } | null;
}

export default function Grades() {
  const { user } = useAuth();
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('submissions')
        .select('*, assignments(title, document_type)')
        .eq('student_id', user!.id)
        .eq('status', 'reviewed')
        .order('submitted_at', { ascending: false });
      setGrades((data || []) as GradeEntry[]);
      setLoading(false);
    })();
  }, [user]);

  const scored = grades.filter(g => g.score != null);
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, g) => s + (g.score || 0), 0) / scored.length) : null;
  const highest = scored.length > 0 ? Math.max(...scored.map(g => g.score || 0)) : null;
  const lowest = scored.length > 0 ? Math.min(...scored.map(g => g.score || 0)) : null;

  function getGrade(score: number) {
    if (score >= 95) return { label: 'A+', color: 'text-green-600 bg-green-50' };
    if (score >= 90) return { label: 'A', color: 'text-green-600 bg-green-50' };
    if (score >= 85) return { label: 'B+', color: 'text-blue-600 bg-blue-50' };
    if (score >= 80) return { label: 'B', color: 'text-blue-600 bg-blue-50' };
    if (score >= 75) return { label: 'C+', color: 'text-amber-600 bg-amber-50' };
    if (score >= 70) return { label: 'C', color: 'text-amber-600 bg-amber-50' };
    return { label: 'F', color: 'text-red-600 bg-red-50' };
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Grades</h1>
        <p className="text-gray-400 text-sm mt-0.5">Your reviewed submissions and scores</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Reviewed', value: grades.length, Icon: GraduationCap, bg: 'bg-[#84001B]' },
              { label: 'Average Score', value: avgScore != null ? `${avgScore}%` : '—', Icon: Star, bg: 'bg-amber-500' },
              { label: 'Highest', value: highest != null ? `${highest}%` : '—', Icon: TrendingUp, bg: 'bg-emerald-600' },
              { label: 'Lowest', value: lowest != null ? `${lowest}%` : '—', Icon: Award, bg: 'bg-blue-600' },
            ].map(({ label, value, Icon, bg }) => (
              <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center text-white mb-3`}><Icon className="w-5 h-5" /></div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-sm text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {grades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <GraduationCap className="w-12 h-12 mb-3" />
              <p className="text-gray-400 font-medium">No reviewed submissions yet</p>
              <p className="text-sm text-gray-300 mt-1">Grades will appear here once your teacher reviews your work</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grades.map(g => {
                const grade = g.score != null ? getGrade(g.score) : null;
                return (
                  <div key={g.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#84001B]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-[#84001B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{g.file_name}</p>
                        <p className="text-sm text-gray-400 truncate">{g.assignments?.title}</p>
                        <p className="text-xs text-gray-300 mt-1">{new Date(g.submitted_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {g.score != null && grade && (
                          <>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-gray-900">{g.score}%</p>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${grade.color}`}>{grade.label}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {g.feedback && (
                      <div className="mt-4 pt-4 border-t border-gray-50">
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Teacher Feedback</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{g.feedback}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
