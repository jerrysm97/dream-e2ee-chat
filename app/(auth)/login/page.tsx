"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const { error: authError } = isSignUp
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (authError) {
            setError(authError.message);
        } else {
            router.push('/portal');
        }
    };

    return (
        <div className="min-h-screen bg-zk-void flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-zk-maroon text-zk-gold flex items-center justify-center text-xl font-display font-bold mx-auto mb-4 border border-zk-hot" style={{ borderRadius: '2px' }}>
                        🔒
                    </div>
                    <h1 className="text-2xl font-display font-bold text-zk-gold tracking-wider mb-1">ZK-TERMINAL</h1>
                    <p className="text-sm text-zk-ash font-mono">Zero-Knowledge Collaboration Terminal</p>
                </div>

                {/* Card */}
                <form onSubmit={handleSubmit} className="bg-zk-deep border border-[rgba(201,168,76,0.12)] p-7 shadow-zk-panel" style={{ borderRadius: '4px' }}>
                    <div className="text-center text-sm font-display font-semibold text-zk-ivory mb-6 uppercase tracking-wider">
                        {isSignUp ? "Register" : "Authenticate"}
                    </div>

                    <input
                        id="email"
                        className="w-full bg-zk-surface border border-[rgba(201,168,76,0.12)] text-zk-ivory text-sm p-3.5 mb-3 font-body focus:border-[rgba(201,168,76,0.35)] focus:outline-none transition-all placeholder:text-zk-ember"
                        style={{ borderRadius: '4px' }}
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        id="password"
                        className="w-full bg-zk-surface border border-[rgba(201,168,76,0.12)] text-zk-ivory text-sm p-3.5 mb-4 font-body focus:border-[rgba(201,168,76,0.35)] focus:outline-none transition-all placeholder:text-zk-ember"
                        style={{ borderRadius: '4px' }}
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />

                    {error && (
                        <div className="border-l-[3px] border-zk-crimson bg-[rgba(192,57,43,0.10)] text-zk-ivory text-xs p-3 mb-4" style={{ borderRadius: '0 4px 4px 0' }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-zk-maroon text-zk-ivory font-display font-semibold text-sm p-3.5 mb-4 hover:bg-zk-hot transition-colors flex items-center justify-center gap-2 cursor-pointer border border-zk-hot tracking-wider uppercase"
                        style={{ borderRadius: '2px' }}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="animate-gold-pulse font-mono">Processing...</span>
                        ) : (
                            isSignUp ? "Register" : "Authenticate"
                        )}
                    </button>

                    <button
                        type="button"
                        className="w-full text-center text-xs text-zk-ash hover:text-zk-gold transition-colors cursor-pointer font-body"
                        onClick={() => { setIsSignUp((v) => !v); setError(null); }}
                    >
                        {isSignUp
                            ? "Already registered? Authenticate"
                            : "Need access? Register"}
                    </button>
                </form>

                <div className="text-center mt-6 text-[11px] text-zk-gold font-mono">
                    🔒 End-to-end encrypted · Zero-Knowledge
                </div>
            </div>
        </div>
    );
}
