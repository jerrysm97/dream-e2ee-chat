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
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
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
            if (!data.session) {
                router.push("/login");
            } else {
                setUserId(data.session.user.id);
                fetchPosts();
            }
        });
    }, [router]);

    async function fetchPosts() {
        setLoading(true);
        const { data, error } = await supabase
            .from("posts")
            .select("*, author:profiles!author_id(display_name, user_tag, avatar_url)")
            .order("created_at", { ascending: false })
            .limit(50);

        if (!error && data) {
            setPosts(data as Post[]);
        }
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
            const { error: uploadErr } = await supabase.storage
                .from("chat-media")
                .upload(path, newPostImage, { cacheControl: "3600", upsert: false });

            if (!uploadErr) {
                const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
                imageUrl = urlData.publicUrl;
            }
        }

        const { error } = await supabase.from("posts").insert({
            author_id: userId,
            content: newPostText.trim(),
            image_url: imageUrl,
        });

        if (!error) {
            setNewPostText("");
            setNewPostImage(null);
            setImagePreview(null);
            fetchPosts();
        }
        setPosting(false);
    }

    async function handleDelete(postId: string) {
        await supabase.from("posts").delete().eq("id", postId);
        setPosts(prev => prev.filter(p => p.id !== postId));
    }

    function toggleLike(postId: string) {
        setLikedPosts(prev => {
            const next = new Set(prev);
            if (next.has(postId)) next.delete(postId);
            else next.add(postId);
            return next;
        });
    }

    function getAuthorInitials(post: Post): string {
        const name = post.author?.display_name || post.author?.user_tag || "??";
        return name.replace("#", "").slice(0, 2).toUpperCase();
    }

    if (loading) {
        return <div className="flex h-screen bg-white items-center justify-center text-dream-primary font-semibold">Loading feed...</div>;
    }

    return (
        <div className="min-h-screen bg-dream-bg">
            {/* Top Bar */}
            <header className="sticky top-0 z-10 bg-white border-b border-dream-border px-4 py-3 flex items-center gap-3">
                <button onClick={() => router.push("/portal")} className="p-2 rounded-lg hover:bg-dream-surface transition-colors text-dream-muted">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-lg font-bold text-dream-text">Feed</h1>
            </header>

            <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
                {/* Create Post */}
                <div className="bg-white border border-dream-border rounded-2xl p-5 shadow-sm">
                    <textarea
                        className="w-full bg-dream-surface border border-dream-border rounded-xl p-3 text-sm text-dream-text placeholder-dream-muted focus:outline-none focus:border-dream-primary focus:ring-2 focus:ring-dream-primary/10 transition-all min-h-[80px] resize-none"
                        placeholder="What's on your mind?"
                        value={newPostText}
                        onChange={e => setNewPostText(e.target.value)}
                    />
                    {imagePreview && (
                        <div className="mt-3 relative">
                            <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-cover rounded-xl border border-dream-border" />
                            <button
                                onClick={() => { setNewPostImage(null); setImagePreview(null); }}
                                className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-lg border border-dream-border text-dream-danger hover:bg-red-50 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between mt-3">
                        <button
                            onClick={() => fileRef.current?.click()}
                            className="flex items-center gap-2 text-sm text-dream-muted hover:text-dream-primary transition-colors p-2 rounded-lg hover:bg-dream-surface"
                        >
                            <ImagePlus size={18} />
                            <span>Photo</span>
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                        <button
                            onClick={handlePost}
                            disabled={posting || (!newPostText.trim() && !newPostImage)}
                            className="flex items-center gap-2 bg-dream-primary text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-dream-primaryLight transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                        >
                            <Send size={14} />
                            {posting ? "Posting..." : "Post"}
                        </button>
                    </div>
                </div>

                {/* Posts Feed */}
                {posts.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-4xl mb-3">📝</div>
                        <div className="font-semibold text-dream-text">No posts yet</div>
                        <div className="text-sm text-dream-muted mt-1">Be the first to share something!</div>
                    </div>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="bg-white border border-dream-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            {/* Post Header */}
                            <div className="flex items-center gap-3 p-4 pb-0">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-dream-primary to-dream-primaryLight flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                    {getAuthorInitials(post)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-dream-text truncate">
                                        {post.author?.display_name || post.author?.user_tag || "Anonymous"}
                                    </div>
                                    <div className="text-xs text-dream-muted">{timeAgo(post.created_at)}</div>
                                </div>
                                {post.author_id === userId && (
                                    <button
                                        onClick={() => handleDelete(post.id)}
                                        className="p-2 text-dream-muted hover:text-dream-danger hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Post Content */}
                            <div className="px-4 py-3">
                                <p className="text-sm text-dream-text leading-relaxed whitespace-pre-wrap">{post.content}</p>
                            </div>

                            {/* Post Image */}
                            {post.image_url && (
                                <div className="px-4 pb-3">
                                    <img src={post.image_url} alt="Post" className="w-full rounded-xl border border-dream-border object-cover max-h-96" />
                                </div>
                            )}

                            {/* Post Actions */}
                            <div className="flex items-center gap-1 px-4 py-3 border-t border-dream-border">
                                <button
                                    onClick={() => toggleLike(post.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${likedPosts.has(post.id) ? "text-dream-primary bg-dream-primary/10" : "text-dream-muted hover:bg-dream-surface"}`}
                                >
                                    <Heart size={16} fill={likedPosts.has(post.id) ? "#8B1A2B" : "none"} />
                                    Like
                                </button>
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-dream-muted hover:bg-dream-surface transition-colors">
                                    <MessageCircle size={16} />
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
