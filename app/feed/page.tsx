"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { ImagePlus, Heart, MessageCircle, Send, ArrowLeft, Trash2 } from "lucide-react";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Post {
    id: string;
    author_id: string;
    content: string;
    image_url: string | null;
    created_at: string;
    author?: {
        display_name: string | null;
        user_tag: string;
        avatar_url: string | null;
    };
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

export default function FeedPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPostText, setNewPostText] = useState("");
    const [newPostImage, setNewPostImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (!data.session) router.push("/login");
            else { setUserId(data.session.user.id); fetchPosts(); }
        });
    }, [router]);

    async function fetchPosts() {
        setLoading(true);
        const { data } = await supabase
            .from("posts")
            .select("*, author:profiles!author_id(display_name, user_tag, avatar_url)")
            .order("created_at", { ascending: false })
            .limit(50);
        if (data) setPosts(data as Post[]);
        setLoading(false);
    }

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setNewPostImage(file);
            const reader = new FileReader();
            reader.onload = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    }

    async function handlePost() {
        if (!newPostText.trim() && !newPostImage) return;
        if (!userId) return;
        setPosting(true);
        let imageUrl: string | null = null;
        if (newPostImage) {
            const ext = newPostImage.name.split(".").pop();
            const path = `posts/${userId}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from("chat-media").upload(path, newPostImage, { cacheControl: "3600", upsert: false });
            if (!uploadErr) {
                const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
                imageUrl = urlData.publicUrl;
            }
        }
        const { error } = await supabase.from("posts").insert({ author_id: userId, content: newPostText.trim(), image_url: imageUrl });
        if (!error) { setNewPostText(""); setNewPostImage(null); setImagePreview(null); fetchPosts(); }
        setPosting(false);
    }

    async function handleDelete(postId: string) {
        await supabase.from("posts").delete().eq("id", postId);
        setPosts(prev => prev.filter(p => p.id !== postId));
    }

    function toggleLike(postId: string) {
        setLikedPosts(prev => { const next = new Set(prev); if (next.has(postId)) next.delete(postId); else next.add(postId); return next; });
    }

    function getAuthorInitials(post: Post): string {
        const name = post.author?.display_name || post.author?.user_tag || "??";
        return name.replace("#", "").slice(0, 2).toUpperCase();
    }

    if (loading) {
        return <div className="flex h-screen bg-zk-void items-center justify-center text-zk-gold font-display font-semibold tracking-wider">Loading feed...</div>;
    }

    return (
        <div className="min-h-screen bg-zk-void">
            {/* Top Bar */}
            <header className="sticky top-0 z-10 bg-zk-surface border-b border-[rgba(201,168,76,0.12)] px-4 py-3 flex items-center gap-3">
                <button onClick={() => router.push("/portal")} className="p-2 text-zk-ash hover:text-zk-gold transition-colors" style={{ borderRadius: '2px' }}>
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-lg font-display font-bold text-zk-gold tracking-wider">Feed</h1>
            </header>

            <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
                {/* Create Post */}
                <div className="bg-zk-deep border border-[rgba(201,168,76,0.12)] p-5 shadow-zk-panel" style={{ borderRadius: '4px' }}>
                    <textarea
                        className="w-full bg-zk-surface border border-[rgba(201,168,76,0.12)] p-3 text-sm text-zk-ivory placeholder:text-zk-ember focus:border-[rgba(201,168,76,0.35)] focus:outline-none transition-all min-h-[80px] resize-none font-body"
                        style={{ borderRadius: '4px' }}
                        placeholder="Broadcast a message…"
                        value={newPostText}
                        onChange={e => setNewPostText(e.target.value)}
                    />
                    {imagePreview && (
                        <div className="mt-3 relative">
                            <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-cover border border-[rgba(201,168,76,0.12)]" style={{ borderRadius: '4px' }} />
                            <button
                                onClick={() => { setNewPostImage(null); setImagePreview(null); }}
                                className="absolute top-2 right-2 bg-zk-void/90 p-1.5 border border-[rgba(192,57,43,0.30)] text-zk-crimson hover:bg-[rgba(192,57,43,0.15)] transition-colors"
                                style={{ borderRadius: '2px' }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between mt-3">
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 text-sm text-zk-ash hover:text-zk-gold transition-colors p-2 font-mono">
                            <ImagePlus size={16} />
                            <span>Attach</span>
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                        <button
                            onClick={handlePost}
                            disabled={posting || (!newPostText.trim() && !newPostImage)}
                            className="flex items-center gap-2 bg-zk-maroon text-zk-ivory px-5 py-2 text-sm font-display font-semibold hover:bg-zk-hot transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-zk-hot tracking-wider uppercase"
                            style={{ borderRadius: '2px' }}
                        >
                            <Send size={14} />
                            {posting ? "Sending..." : "Post"}
                        </button>
                    </div>
                </div>

                {/* Posts */}
                {posts.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-4xl mb-3">📡</div>
                        <div className="font-display font-semibold text-zk-gold">No broadcasts yet</div>
                        <div className="text-sm text-zk-ash mt-1 font-body">Be the first to transmit.</div>
                    </div>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="bg-zk-deep border border-[rgba(201,168,76,0.12)] overflow-hidden shadow-zk-panel hover:border-[rgba(201,168,76,0.25)] transition-all" style={{ borderRadius: '4px' }}>
                            <div className="flex items-center gap-3 p-4 pb-0">
                                <div className="w-10 h-10 bg-zk-maroon flex items-center justify-center text-zk-gold font-display font-bold text-sm flex-shrink-0" style={{ borderRadius: '2px' }}>
                                    {getAuthorInitials(post)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-zk-ivory truncate font-body">
                                        {post.author?.display_name || post.author?.user_tag || "Anonymous"}
                                    </div>
                                    <div className="text-[10px] text-zk-gold font-mono">{timeAgo(post.created_at)}</div>
                                </div>
                                {post.author_id === userId && (
                                    <button onClick={() => handleDelete(post.id)} className="p-2 text-zk-ash hover:text-zk-crimson transition-colors" style={{ borderRadius: '2px' }}>
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="px-4 py-3">
                                <p className="text-sm text-zk-ivory leading-relaxed whitespace-pre-wrap font-body">{post.content}</p>
                            </div>
                            {post.image_url && (
                                <div className="px-4 pb-3">
                                    <img src={post.image_url} alt="Post" className="w-full border border-[rgba(201,168,76,0.12)] object-cover max-h-96" style={{ borderRadius: '4px' }} />
                                </div>
                            )}
                            <div className="flex items-center gap-1 px-4 py-3 border-t border-[rgba(201,168,76,0.08)]">
                                <button
                                    onClick={() => toggleLike(post.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors font-mono ${likedPosts.has(post.id) ? "text-zk-gold bg-[rgba(201,168,76,0.10)]" : "text-zk-ash hover:text-zk-gold hover:bg-[rgba(107,26,26,0.10)]"}`}
                                    style={{ borderRadius: '2px' }}
                                >
                                    <Heart size={14} fill={likedPosts.has(post.id) ? "#C9A84C" : "none"} />
                                    Like
                                </button>
                                <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zk-ash hover:text-zk-gold hover:bg-[rgba(107,26,26,0.10)] transition-colors font-mono" style={{ borderRadius: '2px' }}>
                                    <MessageCircle size={14} />
                                    Comment
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
