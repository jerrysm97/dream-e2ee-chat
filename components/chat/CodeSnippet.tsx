"use client";

import React, { useEffect, useRef } from "react";
import hljs from "highlight.js";
import 'highlight.js/styles/atom-one-dark.css';

interface CodeSnippetProps {
    code: string;
    language?: string;
}

export default function CodeSnippet({ code, language }: CodeSnippetProps) {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            codeRef.current.removeAttribute('data-highlighted');
            hljs.highlightElement(codeRef.current);
        }
    }, [code, language]);

    return (
        <div className="my-3 overflow-hidden border border-[rgba(201,168,76,0.25)] border-l-[3px] border-l-zk-gold font-mono text-sm bg-black relative" style={{ borderRadius: '2px' }}>
            <div className="bg-zk-void px-4 py-1.5 text-xs text-zk-gold border-b border-[rgba(201,168,76,0.12)] flex justify-between items-center" style={{ opacity: 0.8 }}>
                <span className="font-mono">{language || 'text'}</span>
                <button
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="text-zk-ash hover:text-zk-gold transition-colors cursor-pointer font-mono"
                    title="Copy to clipboard"
                >
                    Copy
                </button>
            </div>
            <pre className="m-0 p-4 overflow-x-auto">
                <code ref={codeRef} className={`${language ? `language-${language}` : ''} text-zk-gold-pale`} style={{ fontSize: '0.88rem' }}>
                    {code}
                </code>
            </pre>
        </div>
    );
}
