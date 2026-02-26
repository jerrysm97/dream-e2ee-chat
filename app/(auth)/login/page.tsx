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
        <div className="min-h-screen bg-dream-bg flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-dream-primary text-white flex items-center justify-center text-xl font-bold mx-auto mb-4 rounded-2xl shadow-lg">
                        D
                    </div>
                    <h1 className="text-2xl font-bold text-dream-text mb-1">Dream</h1>
                    <p className="text-sm text-dream-muted">Secure E2EE Messenger</p>
                </div>

                {/* Card */}
                <form onSubmit={handleSubmit} className="bg-white border border-dream-border p-7 rounded-2xl shadow-sm">
                    <div className="text-center text-sm font-semibold text-dream-text mb-6">
                        {isSignUp ? "Create Account" : "Sign In"}
                    </div>

                    <input
                        id="email"
                        className="w-full bg-dream-surface border border-dream-border text-dream-text text-sm p-3.5 mb-3 rounded-xl focus:border-dream-primary focus:outline-none focus:ring-2 focus:ring-dream-primary/10 transition-all placeholder-dream-muted"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        id="password"
                        className="w-full bg-dream-surface border border-dream-border text-dream-text text-sm p-3.5 mb-4 rounded-xl focus:border-dream-primary focus:outline-none focus:ring-2 focus:ring-dream-primary/10 transition-all placeholder-dream-muted"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />

                    {error && <div className="bg-red-50 border border-red-200 text-dream-danger text-xs p-3 rounded-xl mb-4">{error}</div>}

                    <button
                        type="submit"
                        className="w-full bg-dream-primary text-white font-semibold text-sm p-3.5 rounded-xl mb-4 hover:bg-dream-primaryLight transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="animate-pulse">Processing...</span>
                        ) : (
                            isSignUp ? "Create Account" : "Sign In"
                        )}
                    </button>

                    <button
                        type="button"
                        className="w-full text-center text-xs text-dream-muted hover:text-dream-primary transition-colors cursor-pointer"
                        onClick={() => { setIsSignUp((v) => !v); setError(null); }}
                    >
                        {isSignUp
                            ? "Already have an account? Sign in"
                            : "Don't have an account? Sign up"}
                    </button>
                </form>

                <div className="text-center mt-6 text-[11px] text-dream-muted">
                    🔒 End-to-end encrypted messaging
                </div>
            </div>
        </div>
    );
}
