  import { CoreMessage } from "ai";
import { Playbook } from "./base-playbook";
import { ToolResult } from "../agent/tool-definition";
import { ProjectContextAnalyzer } from "../capabilities/tools/analyzers/project-context-analyzer";
import { LLMLogger } from "../services/llm/llm-logger";
import { generateText } from "ai";
import { configureLLMProvider } from "../services/llm";
import { ToolPromptBuilder } from "../agent/tool-prompt-builder";

/**
 * FeatureRequestPlaybook 专注于管理功能请求分析和自动化 PR 生成的提示词策略
 * 参考 Augment Agent 的设计理念，提供规划驱动的工作流程
 */
export class FeatureRequestPlaybook extends Playbook {
  private logger: LLMLogger;
  private llmConfig: any;
  protected basePrompt: string;
  private toolPromptBuilder: ToolPromptBuilder;

  constructor(options: { skipLLMConfig?: boolean } = {}) {
    const basePrompt = `You are an expert AI coding agent specialized in feature request analysis and automated PR generation. You have comprehensive capabilities for software development, analysis, and automation. You have access to a powerful suite of tools that enable you to work with codebases, manage projects, and provide intelligent assistance.

## Core Capabilities & Tool Combinations

Your approach should be **planning-driven**: always create a detailed plan first, then execute it systematically.

### 🎯 Feature Request Analysis Workflow:
1. **Requirements Analysis**: Understand the core feature request and business value
2. **Codebase Discovery**: Search and analyze existing related implementations
3. **Architecture Planning**: Design the implementation approach and identify required components
4. **Code Generation**: Generate the actual implementation code
5. **PR Creation**: Create comprehensive pull requests with proper documentation

### 🔧 Recommended Tool Combinations:
- **Feature analysis**: github-analyze-issue + search-keywords + read-file + analyze-basic-context
- **Codebase exploration**: grep-search + search-keywords + read-file + list-directory
- **Implementation planning**: analyze-basic-context + search-keywords + read-file
- **Code generation**: str-replace-editor + read-file + search-keywords

### 🚨 CRITICAL: str-replace-editor Tool Usage
When using str-replace-editor, follow these EXACT rules:
- Use {{ ... }} ONLY to represent unchanged code sections that should be preserved
- DO NOT use {{ ... existing code ... }} or similar template syntax
- Provide the EXACT code you want in the file, with {{ ... }} for unchanged parts
- Example: If editing a class, show the actual methods you want to add/modify
- **External research**: google-search + read-file + analyze-basic-context
- **Architecture analysis**: analyze-dependencies + list-directory + read-file

### 📋 Planning Approach:
Before executing any implementation:
1. Create a detailed, low-level plan with specific files to modify/create
2. Identify all dependencies and integration points
3. Plan the testing strategy
4. Consider backward compatibility and migration needs
5. Outline the PR structure and documentation requirements

### 🎨 Code Quality Standards:
- Follow existing code patterns and conventions
- Ensure proper error handling and logging
- Add comprehensive tests for new functionality
- Include proper documentation and comments
- Consider performance and security implications`;

    super(basePrompt);
    this.basePrompt = basePrompt;
    this.logger = new LLMLogger('feature-request-playbook.log');
    this.toolPromptBuilder = new ToolPromptBuilder();

    if (!options.skipLLMConfig) {
      this.llmConfig = configureLLMProvider();
      if (!this.llmConfig) {
        throw new Error('No LLM provider configured. Please set GLM_TOKEN, DEEPSEEK_TOKEN, or OPENAI_API_KEY');
      }
    }
  }

  /**
   * 注册可用的工具
   */
  registerTools(tools: any[]): void {
    super.registerTools(tools);
    this.toolPromptBuilder.registerTools(tools);
  }

  /**
   * 为功能请求分析准备提示词 - 采用规划驱动的方法
   */
  preparePrompt(userInput: string, context?: any): string {
    return `You are continuing a comprehensive feature request analysis and implementation workflow.

## Analysis Approach:
To provide a complete solution, follow this systematic approach using multiple tools:

1. **Feature Requirements Analysis**: Start with github-analyze-issue to understand the core feature request and business value
2. **Codebase Discovery**: Use search-keywords + grep-search + read-file to explore existing implementations and identify integration points
3. **Architecture Planning**: Use analyze-basic-context + list-directory to understand project structure and design the implementation approach
4. **Implementation Strategy**: Use str-replace-editor to make actual code changes and file modifications
5. **Testing & Documentation**: Plan comprehensive testing and documentation requirements

## Tool Usage Strategy:
- **For GitHub Issues**: Use github-analyze-issue to understand the feature request context and requirements
- **For Code Discovery**: Use search-keywords + grep-search + read-file to explore existing implementations in the CURRENT workspace
- **For Architecture Analysis**: Use analyze-basic-context + list-directory to understand the CURRENT project structure (not external projects)
- **For Implementation**: Use str-replace-editor to make precise code changes - THIS IS CRITICAL for feature implementation
  * NEVER use template syntax like {{ ... existing code ... }}
  * Use {{ ... }} ONLY for unchanged code sections
  * Provide EXACT code content, not placeholders
- **For External Knowledge**: Use google-search when you need information about technologies, patterns, or best practices

## CRITICAL WORKSPACE AWARENESS:
- **ALWAYS explore the CURRENT workspace first** - do not assume external project structures exist
- **Use list-directory to understand the actual project structure** before making assumptions
- **Search for existing similar functionality** in the current codebase using search-keywords and grep-search
- **Focus on the autodev-workbench project structure**, not external projects like Roo-Code

## CRITICAL IMPLEMENTATION REQUIREMENTS:
- **ALWAYS attempt to make actual code changes** using str-replace-editor when implementing features
- **If code modification fails**, provide detailed implementation guidance with specific file paths and code examples
- **Focus on practical, working solutions** rather than just theoretical analysis
- **Ensure code changes follow existing patterns** and maintain code quality standards

## Planning Requirements:
Before making any code changes, you must:
1. Create a detailed implementation plan with specific files to modify/create
2. Identify all dependencies and integration points
3. Consider backward compatibility and migration needs
4. Plan the testing strategy and documentation updates
5. Outline the PR structure and commit strategy

User Request: ${userInput}

${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}`;
  }

  /**
   * 为多轮对话构建消息 - 实现规划驱动的工作流程
   */
  async buildMessagesForRound(
    input: string,
    context: any,
    round: number,
    conversationHistory: CoreMessage[] = [],
    workspacePath?: string
  ): Promise<CoreMessage[]> {
    const messages: CoreMessage[] = [];

    if (round === 1) {
      let contextInfo = '';
      if (workspacePath) {
        try {
          const analyzer = new ProjectContextAnalyzer();
          const analysisResult = await analyzer.analyze(workspacePath, "basic");

          // Extract project information from the analysis result
          const projectName = analysisResult.project_info?.name || 'Unknown Project';
          const projectType = analysisResult.project_info?.type || 'Unknown Type';
          const projectDescription = analysisResult.project_info?.description || 'No description available';

          // Build insights and recommendations summary
          const insightsSummary = analysisResult.insights?.length > 0
            ? analysisResult.insights.slice(0, 3).join('\n- ')
            : 'No specific insights available';

          const recommendationsSummary = analysisResult.recommendations?.length > 0
            ? analysisResult.recommendations.slice(0, 3).join('\n- ')
            : 'No specific recommendations available';

          contextInfo = `
## 📋 PROJECT CONTEXT:
Working in directory: ${workspacePath}

### Project Information:
- **Name**: ${projectName}
- **Type**: ${projectType}
- **Description**: ${projectDescription}

### Key Insights:
- ${insightsSummary}

### Recommendations:
- ${recommendationsSummary}
`;
        } catch (error) {
          contextInfo = `
## 📋 PROJECT CONTEXT:
Working in directory: ${workspacePath}
(Project analysis unavailable - proceeding with general assistance)
`;
        }
      }

      messages.push({
        role: "system",
        content: this.basePrompt + contextInfo + '\n\n' + this.toolPromptBuilder.buildToolSystemPrompt()
      });
    } else {
      messages.push({
        role: "system",
        content: this.buildContinuationSystemPrompt(round, context.previousResults || [])
      });
    }

    // Add conversation history (but limit it for multi-round)
    const historyLimit = Math.max(0, conversationHistory.length - 10);
    messages.push(...conversationHistory.slice(historyLimit));

    // Add current user input with context
    const userPrompt = this.buildUserPromptForRound(input, context, context.previousResults || [], round);
    messages.push({
      role: "user",
      content: userPrompt
    });

    return messages;
  }

  /**
   * 构建继续对话的系统提示词
   */
  private buildContinuationSystemPrompt(round: number, previousResults: ToolResult[]): string {
    const successfulTools = previousResults.filter(r => r.success);
    const toolSummary = successfulTools.map(r => `${r.functionCall.name}: ${r.success ? 'Success' : 'Failed'}`).join(', ');

    return `You are continuing a multi-round feature request analysis and implementation workflow.

## Previous Progress:
- Round: ${round}
- Tools executed: ${toolSummary}
- Successful tools: ${successfulTools.length}/${previousResults.length}

## Current Round Focus:
${this.getRoundFocus(round)}

${this.toolPromptBuilder.buildToolSystemPrompt()}

Continue building upon the previous analysis results to provide comprehensive feature implementation guidance.`;
  }

  /**
   * 获取当前轮次的重点
   */
  private getRoundFocus(round: number): string {
    switch (round) {
      case 2:
        return `**Codebase Discovery & Architecture Analysis**
- Explore existing implementations and patterns using list-directory and grep-search
- Identify integration points and dependencies
- Analyze project structure and conventions
- Gather technical context for implementation planning`;
      case 3:
        return `**Implementation Planning & Code Generation**
- Create detailed implementation plan
- **CRITICAL: Use str-replace-editor to make actual code changes**
- **CRITICAL: Use write-file to create new files if needed**
- Generate specific code modifications and new components
- Plan testing strategy and documentation
- Prepare for PR creation`;
      case 4:
        return `**Code Implementation & File Creation**
- **MANDATORY: Execute str-replace-editor for code modifications**
- **MANDATORY: Execute write-file for new file creation**
- Implement the planned code changes
- Create necessary configuration files
- Add proper error handling and logging`;
      case 5:
        return `**Testing & Documentation**
- Create test files using write-file
- Update documentation files
- Verify implementation completeness
- Prepare final PR summary`;
      default:
        return `**Final Implementation & Quality Assurance**
- Complete any remaining code changes using str-replace-editor
- Ensure all files are created and modified as planned
- Provide comprehensive implementation summary`;
    }
  }

  /**
   * 构建用户提示词
   */
  private buildUserPromptForRound(input: string, context: any, previousResults: ToolResult[], round: number): string {
    const basePrompt = this.preparePrompt(input, context);

    if (round === 1) {
      return `${basePrompt}

## Round 1: Feature Requirements Analysis
Focus on understanding the feature request and gathering initial context. Use tools to:
1. Analyze the GitHub issue or feature request details
2. Understand the business value and user requirements
3. Identify the scope and complexity of the feature
4. Gather initial project context

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    } else if (round === 2) {
      return `Feature Request: ${input}

## Round 2: Codebase Discovery & Architecture Analysis
Based on the initial analysis, now focus on technical discovery in the CURRENT workspace:

**CRITICAL**: The issue mentions migrating from "Roo-Code/src/services/code-index" but this directory does NOT exist in the current workspace. Instead:

1. **First explore the CURRENT project structure** using list-directory on "." or "packages/" to understand what exists
2. **Search for existing code indexing/analysis functionality** in the current autodev-workbench project using search-keywords with terms like "indexing", "embedding", "vector", "context", "analysis"
3. **Look for MCP service implementations** or similar service patterns in the current codebase
4. **Identify where to implement the new MCP service** based on the current project structure

**Do NOT try to access Roo-Code directories** - focus on the current autodev-workbench project structure.

Previous findings summary:
${this.summarizePreviousResults(previousResults)}

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    } else if (round === 3) {
      return `Feature Request: ${input}

## Round 3: MANDATORY Code Implementation

**CRITICAL REQUIREMENTS FOR THIS ROUND:**
1. **MUST use str-replace-editor** to make actual code changes to existing files
2. **MUST use write-file** to create new files if needed
3. **MUST implement concrete code solutions** - not just plans or recommendations
4. **MUST follow the implementation plan** from previous analysis

**MANDATORY ACTIONS:**
- If creating new services/components: Use write-file to create the files
- If modifying existing files: Use str-replace-editor to make precise changes
- If adding configuration: Use write-file or str-replace-editor as appropriate
- Include proper imports, error handling, and integration code

**CRITICAL str-replace-editor Rules:**
- NEVER use {{ ... existing code ... }} or similar template syntax
- Use {{ ... }} ONLY to represent unchanged code sections
- Provide EXACT code content, not placeholders or comments
- Example: Instead of "{{ ... existing methods ... }}", show the actual methods

**FAILURE TO EXECUTE CODE CHANGES WILL BE CONSIDERED A FAILED IMPLEMENTATION**

Based on all previous analysis, implement the concrete code changes:
1. Execute the planned code modifications using str-replace-editor
2. Create new files using write-file as needed
3. Ensure proper integration with existing codebase
4. Add comprehensive error handling and logging
5. Include proper imports and dependencies

Complete analysis summary:
${this.summarizePreviousResults(previousResults)}

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    } else if (round === 4) {
      return `Feature Request: ${input}

## Round 4: Git Workflow & Repository Management

**CRITICAL REQUIREMENTS FOR THIS ROUND:**
1. **MUST use run-terminal-command** to execute git commands
2. **MUST check git status** to identify any untracked or modified files
3. **MUST review changes** using git diff before committing
4. **MUST create meaningful commit messages** following project conventions

**Git Workflow Steps:**
1. Check current git status: \`git status\`
2. Review changes: \`git diff\` and \`git diff --staged\`
3. Add files to staging: \`git add .\` or specific files
4. Create commit with meaningful message: \`git commit -m "feat: implement [feature description]"\`
5. Check for any build/test scripts and run them
6. Create a new branch if needed: \`git checkout -b feature/issue-[number]\`

**Quality Checks:**
- Verify no unwanted files are being committed
- Ensure commit message follows conventional commits format
- Check if any build or test commands should be run

Previous implementation summary:
${this.summarizePreviousResults(previousResults)}

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    } else if (round === 5) {
      return `Feature Request: ${input}

## Round 5: Testing & Build Verification

**CRITICAL REQUIREMENTS FOR THIS ROUND:**
1. **MUST run build commands** to verify the implementation compiles
2. **MUST run tests** if test scripts exist in package.json
3. **MUST check for linting issues** and fix them if possible
4. **MUST verify the feature works** as expected

**Testing & Build Steps:**
1. Check package.json for available scripts: \`cat package.json | grep -A 10 "scripts"\`
2. Run build command: \`npm run build\` or \`pnpm build\`
3. Run tests: \`npm test\` or \`pnpm test\`
4. Run linting: \`npm run lint\` or \`pnpm lint\`
5. Fix any issues found during build/test/lint

**Verification Focus:**
- Does the code compile without errors?
- Do existing tests still pass?
- Are there any linting issues to fix?
- Does the new feature work as expected?

Previous workflow summary:
${this.summarizePreviousResults(previousResults)}

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    } else if (round === 6) {
      return `Feature Request: ${input}

## Round 6: GitHub PR Creation & Documentation

**CRITICAL REQUIREMENTS FOR THIS ROUND:**
1. **MUST push changes** to a feature branch
2. **MUST create a GitHub PR** using github-pr-create tool
3. **MUST write comprehensive PR description** including implementation details
4. **MUST link the PR to the original issue**

**PR Creation Steps:**
1. Push the feature branch: \`git push origin feature/issue-[number]\`
2. Create PR using github-pr-create with:
   - Clear title referencing the issue
   - Detailed description of changes
   - Link to original issue (#[issue-number])
   - Testing instructions
   - Screenshots/examples if applicable

**PR Description Template:**
\`\`\`
## Description
Brief description of the feature implementation

## Changes Made
- List of specific changes
- Files modified/created
- Key implementation details

## Testing
- How to test the feature
- Test cases covered
- Build/test results

## Related Issue
Closes #[issue-number]
\`\`\`

Previous testing summary:
${this.summarizePreviousResults(previousResults)}

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    } else {
      return `Feature Request: ${input}

## Round ${round}: Additional Analysis & Refinement

**QUALITY ASSURANCE & FINALIZATION:**
1. **Review and refine** any remaining implementation details
2. **Add missing pieces** like tests, documentation, or configuration
3. **Verify completeness** against the original requirements
4. **Suggest next steps** for deployment and testing

Previous workflow summary:
${this.summarizePreviousResults(previousResults)}

${this.toolPromptBuilder.buildToolUserPrompt(round)}`;
    }
  }



  /**
   * 构建最终的总结提示词
   */
  prepareSummaryPrompt(userInput: string, toolResults: ToolResult[], currentState: string): string {
    const successfulTools = toolResults.filter(r => r.success);
    const failedTools = toolResults.filter(r => !r.success);

    return `Based on the comprehensive feature request analysis, generate a detailed implementation report and action plan.

Feature Request: ${userInput}

Analysis Results Summary:
- Successful tool executions: ${successfulTools.length}
- Failed tool executions: ${failedTools.length}
- Current analysis state: ${currentState}

## Required Report Structure:

### 1. 🎯 Feature Overview
- Core feature requirements and business value
- Scope and complexity assessment
- Key stakeholders and use cases

### 2. 🔍 Technical Analysis
- Existing codebase analysis and integration points
- Architecture considerations and design patterns
- Technical feasibility and potential challenges
- Dependencies and compatibility requirements

### 3. 🚀 Implementation Plan
- Detailed step-by-step implementation approach
- Specific files to create/modify with rationale
- Code structure and organization strategy
- Integration and testing approach

### 4. 🛠️ Technical Specifications
- API design and data models
- Component architecture and interfaces
- Error handling and edge cases
- Performance and security considerations

### 5. 📋 Action Items & Next Steps
- Prioritized implementation tasks
- Testing strategy and coverage requirements
- Documentation and PR preparation
- Deployment and rollout considerations

The report should be comprehensive, actionable, and ready for immediate implementation by a development team.`;
  }

  /**
   * 验证执行结果的提示词
   */
  prepareVerificationPrompt(userInput: string, results: ToolResult[]): string {
    const successfulTools = results.filter(r => r.success);
    const failedTools = results.filter(r => !r.success);

    return `Verification Phase: Validate the completeness and quality of the feature request analysis.

Feature Request: ${userInput}

Analysis Results:
- Successful tool executions: ${successfulTools.length}
- Failed tool executions: ${failedTools.length}

## Verification Checklist:
1. ✅ Requirements Understanding: Are the core requirements clearly identified and understood?
2. ✅ Technical Feasibility: Is the technical analysis comprehensive and realistic?
3. ✅ Implementation Plan: Is the implementation approach detailed and actionable?
4. ✅ Integration Strategy: Are all integration points and dependencies identified?
5. ✅ Testing & Quality: Is the testing strategy comprehensive and appropriate?
6. ✅ Documentation: Are documentation requirements clearly specified?
7. ✅ Risk Assessment: Are potential risks and mitigation strategies identified?

Provide specific feedback on any gaps or areas that need additional analysis.`;
  }

  /**
   * Generate a comprehensive final response based on all tool results
   */
  async generateComprehensiveFinalResponse(
    userInput: string,
    lastLLMResponse: string,
    allToolResults: ToolResult[],
    totalRounds: number
  ): Promise<string> {
    this.logger.logAnalysisStart('FEATURE REQUEST FINAL RESPONSE', {
      userInput,
      lastLLMResponse,
      totalRounds,
      toolResultsCount: allToolResults.length
    });

    const successfulResults = allToolResults.filter(r => r.success);
    const failedResults = allToolResults.filter(r => !r.success);

    const comprehensivePrompt = `Based on the feature request analysis and the results from various tools, provide a comprehensive implementation guide and action plan.

## Feature Request Analysis Summary

**Original Request:** ${userInput}

**Analysis Rounds Completed:** ${totalRounds}
**Tools Executed:** ${allToolResults.length} (${successfulResults.length} successful, ${failedResults.length} failed)

## Analysis Results
${this.summarizePreviousResults(allToolResults)}

${failedResults.length > 0 ? `## Analysis Limitations
Some analysis tools encountered issues:
${failedResults.map(r => `- ${r.functionCall.name}: ${r.error}`).join('\n')}
` : ''}

## Last LLM Analysis:
${lastLLMResponse}

---

## Required Output:

Provide a comprehensive feature implementation guide that includes:

1. **🎯 Executive Summary**: Clear overview of the feature and its value proposition
2. **🔍 Technical Analysis**: Detailed analysis of the codebase and integration requirements
3. **🚀 Implementation Roadmap**: Step-by-step implementation plan with specific tasks
4. **💻 Code Implementation**: Specific code changes, file modifications, and new components needed
   - If str-replace-editor was used successfully, highlight the actual code changes made with file references
   - If code changes weren't made, provide complete, working code examples with exact file paths
   - Include imports, error handling, and integration with existing code patterns
5. **🧪 Testing Strategy**: Comprehensive testing approach including unit, integration, and e2e tests
   - Provide specific test file locations and complete test code examples
6. **📚 Documentation Plan**: Documentation requirements and structure
7. **🚀 Deployment & Rollout**: Deployment strategy and rollout considerations
8. **⚠️ Risk Assessment**: Potential risks and mitigation strategies

## CRITICAL IMPLEMENTATION REQUIREMENTS:
- **ALWAYS prioritize actual code changes** over theoretical discussions
- **Reference specific files and line numbers** that were modified or need modification
- **Include complete, working code examples** with proper syntax and imports
- **Follow existing code patterns** found in the codebase and maintain consistency
- **Cite sources for all implementation details** - reference specific files analyzed

Make this guide immediately actionable for a development team to implement the feature successfully.`;

    try {
      const messages: CoreMessage[] = [
        {
          role: "system",
          content: "You are an expert software architect and feature implementation specialist. Provide clear, comprehensive, and immediately actionable implementation guides based on thorough analysis results. Focus on practical implementation details, actual code changes, and successful delivery. ALWAYS prioritize showing actual code modifications over theoretical discussions. Include complete, working code examples with proper source citations. Reference specific files and line numbers that were analyzed or modified."
        },
        { role: "user", content: comprehensivePrompt }
      ];

      this.logger.log('Sending request to LLM', {
        messages,
        temperature: 0.1,
        maxTokens: 4000
      });

      const { text } = await generateText({
        model: this.llmConfig.openai(this.llmConfig.fullModel),
        messages,
        temperature: 0.1,
        maxTokens: 4000
      });

      this.logger.log('Received response from LLM', {
        response: text
      });

      this.logger.logAnalysisSuccess('FEATURE REQUEST FINAL RESPONSE');
      return text;
    } catch (error) {
      this.logger.logAnalysisFailure('FEATURE REQUEST FINAL RESPONSE', error);
      console.warn('Error generating comprehensive final response:', error);
      // Fallback to simpler response
      const fallbackResponse = this.buildFallbackResponse(userInput, allToolResults, totalRounds);
      this.logger.logAnalysisFallback('FEATURE REQUEST FINAL RESPONSE', error instanceof Error ? error.message : String(error), fallbackResponse);
      return fallbackResponse;
    }
  }

  /**
   * Summarize previous tool results for context
   */
  private summarizePreviousResults(results: ToolResult[]): string {
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    // Build detailed summary with actual tool results content
    const detailedSummary = successfulResults
      .map(result => {
        const toolName = result.functionCall.name;
        let content = '';

        // Extract content from tool result
        if (result.result?.content && Array.isArray(result.result.content)) {
          const textContent = result.result.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join('\n');
          content = textContent;
        } else if (result.result?.content) {
          content = String(result.result.content);
        }

        // Truncate very long content to keep prompt manageable
        const maxContentLength = 2000;
        if (content.length > maxContentLength) {
          content = content.substring(0, maxContentLength) + '\n... [content truncated]';
        }

        return `## ${toolName} (Round ${result.round})
${content}`;
      })
      .join('\n\n');

    // Add failed tools summary
    const failedSummary = failedResults.length > 0
      ? `\n\n## Failed Tools\n${failedResults.map(r => `❌ ${r.functionCall.name}: ${r.error} (Round ${r.round})`).join('\n')}`
      : '';

    const successCount = successfulResults.length;
    const totalCount = results.length;

    return `${detailedSummary}${failedSummary}\n\n**Execution Summary:** ${successCount}/${totalCount} tools executed successfully`;
  }

  /**
   * Format tool result for display
   */
  private formatToolResult(result: ToolResult): string {
    if (!result.result || !result.result.content) {
      return "No content returned";
    }

    const content = Array.isArray(result.result.content)
      ? result.result.content[0]?.text || "No text content"
      : result.result.content;

    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // Truncate very long results
    if (text.length > 500) {
      return text.substring(0, 500) + '\n... (truncated)';
    }

    return text;
  }

  /**
   * Build fallback response when LLM fails
   */
  private buildFallbackResponse(userInput: string, allToolResults: ToolResult[], totalRounds: number): string {
    const successfulResults = allToolResults.filter(r => r.success);

    return `# Feature Request Analysis Report

## Request: ${userInput}

## Analysis Summary
- **Rounds Completed:** ${totalRounds}
- **Tools Executed:** ${allToolResults.length}
- **Successful Executions:** ${successfulResults.length}

## Tool Results Summary
${successfulResults.map(result => `
### ${result.functionCall.name}
${this.formatToolResult(result)}
`).join('\n')}

## Next Steps
Based on the analysis results above, the development team should:
1. Review the technical findings and integration points
2. Create detailed implementation tasks
3. Set up the development environment and dependencies
4. Begin implementation following the identified patterns
5. Implement comprehensive testing strategy

*Note: This is a fallback response due to LLM processing limitations. Please review the tool results above for detailed technical information.*`;
  }
}