"use client";

import React, { useEffect, useRef } from "react";
import hljs from "highlight.js";
import 'highlight.js/styles/atom-one-light.css';

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
        <div className="my-3 rounded-lg overflow-hidden border border-dream-border font-mono text-sm bg-[#FAFAFA] relative">
            <div className="bg-dream-surface px-4 py-1.5 text-xs text-dream-muted border-b border-dream-border flex justify-between items-center">
                <span className="font-medium">{language || 'text'}</span>
                <button
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="text-dream-muted hover:text-dream-primary transition-colors cursor-pointer font-medium"
                    title="Copy to clipboard"
                >
                    Copy
                </button>
            </div>
            <pre className="m-0 p-4 overflow-x-auto">
                <code ref={codeRef} className={language ? `language-${language}` : ''}>
                    {code}
                </code>
            </pre>
        </div>
    );
}
