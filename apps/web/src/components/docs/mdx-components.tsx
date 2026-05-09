import React from 'react';
import type { MDXComponents } from 'mdx/types';

// Shared blocks
import { Callout } from './blocks/Callout';
import { KeyboardShortcut } from './blocks/KeyboardShortcut';
import { PlanBadge } from './blocks/PlanBadge';
import { StepFlow } from './blocks/StepFlow';
import { ComparisonTable } from './blocks/ComparisonTable';
import { Screenshot } from './blocks/Screenshot';
import { VideoEmbed } from './blocks/VideoEmbed';
import { ProcessDiagram } from './blocks/ProcessDiagram';
import { FeatureCard } from './blocks/FeatureCard';

// Sysadmin-specific blocks
import { ApiTable } from './blocks/sysadmin/ApiTable';
import { RlsPolicyBox } from './blocks/sysadmin/RlsPolicyBox';
import { PrismaModelRef } from './blocks/sysadmin/PrismaModelRef';
import { CodeBlock } from './blocks/sysadmin/CodeBlock';

// Base HTML element overrides with Tailwind prose-like styling
const baseComponents: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold tracking-tight text-foreground mt-8 mb-4">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-3">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-semibold text-foreground mt-6 mb-2">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-lg font-medium text-foreground mt-4 mb-2">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-base leading-7 text-muted-foreground mb-4 max-w-prose">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 mb-4 space-y-2 text-muted-foreground max-w-prose">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 mb-4 space-y-2 text-muted-foreground max-w-prose">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="p-4 bg-muted rounded-lg border border-border overflow-x-auto my-6 font-mono text-sm">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-border pl-4 italic text-muted-foreground my-4">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-6">
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="bg-muted text-left p-3 border-b border-border font-medium text-sm">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="p-3 border-b border-border text-sm text-muted-foreground">
      {children}
    </td>
  ),
};

/**
 * Component map for client-facing Help Center documentation
 */
export const clientComponents: MDXComponents = {
  ...baseComponents,
  Callout,
  KeyboardShortcut,
  PlanBadge,
  StepFlow,
  ComparisonTable,
  Screenshot,
  VideoEmbed,
  ProcessDiagram,
  FeatureCard,
};

/**
 * Component map for sysadmin technical documentation
 * Extends client components with engineering-specific blocks
 */
export const sysadminComponents: MDXComponents = {
  ...clientComponents,
  ApiTable,
  RlsPolicyBox,
  PrismaModelRef,
  CodeBlock,
  // Override pre to use CodeBlock for sysadmin docs
  pre: ({ children, ...props }: any) => {
    // Extract code content and language from children
    const codeElement = React.Children.toArray(children).find(
      (child) => React.isValidElement(child) && child.type === 'code'
    ) as React.ReactElement<{ children: string; className?: string }> | undefined;

    if (codeElement && codeElement.props) {
      const code = codeElement.props.children as string;
      const language = codeElement.props.className?.replace('language-', '');
      return <CodeBlock language={language}>{code}</CodeBlock>;
    }

    // Fallback to base pre - render as simple pre/code
    return (
      <pre className="p-4 bg-muted rounded-lg border border-border overflow-x-auto my-6 font-mono text-sm" {...props}>
        {children}
      </pre>
    );
  },
};
