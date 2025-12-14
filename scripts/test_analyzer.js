#!/usr/bin/env node
/**
 * 测试 LLM 分析器
 */
const { analyzeSession } = require('../plugin/claude-code-mem/scripts/llm_analyzer');

// 模拟会话数据
const mockSessionData = [
  {
    id: 'uuid-1',
    type: 'user_message',
    content: '帮我修复一个内存泄漏的bug，在循环中创建了太多闭包',
    timestamp: '2024-12-14T08:00:00.000Z',
  },
  {
    id: 'uuid-2',
    type: 'assistant_message',
    content:
      '我理解了。这是一个常见的内存泄漏问题。让我帮你分析一下：\n\n1. 问题原因：在循环中创建闭包时，每个闭包都会持有外部作用域的引用\n2. 解决方案：使用 WeakMap 来存储引用，这样垃圾回收器可以正常工作\n3. 实现：将原来的 Map 改为 WeakMap',
    timestamp: '2024-12-14T08:00:30.000Z',
  },
  {
    id: 'uuid-3',
    type: 'tool_execution',
    tool_name: 'read_file',
    result: 'const cache = new Map(); // 这里会导致内存泄漏',
    timestamp: '2024-12-14T08:01:00.000Z',
  },
  {
    id: 'uuid-4',
    type: 'tool_execution',
    tool_name: 'edit_file',
    result: '已修改：const cache = new WeakMap(); // 使用 WeakMap 避免内存泄漏',
    timestamp: '2024-12-14T08:01:30.000Z',
  },
  {
    id: 'uuid-5',
    type: 'user_message',
    content: '很好！这样修改后性能如何？',
    timestamp: '2024-12-14T08:02:00.000Z',
  },
  {
    id: 'uuid-6',
    type: 'assistant_message',
    content:
      '使用 WeakMap 后：\n- 内存占用大幅下降\n- 垃圾回收更及时\n- 性能基本无影响\n\n需要注意的是，WeakMap 只能使用对象作为 key。',
    timestamp: '2024-12-14T08:02:30.000Z',
  },
];

async function test() {
  console.log('🧪 Testing LLM Analyzer...\n');
  console.log('📝 Mock session data:');
  console.log(JSON.stringify(mockSessionData, null, 2));
  console.log('\n---\n');

  const result = await analyzeSession(mockSessionData);

  if (result) {
    console.log('✅ Analysis completed!\n');
    console.log('📊 Results:');
    console.log(JSON.stringify(result, null, 2));

    if (result.summary) {
      console.log('\n📋 Summary:');
      console.log(`  Request: ${result.summary.request_summary}`);
      console.log(`  Learned: ${result.summary.learned_summary}`);
    }

    if (result.observations && result.observations.length > 0) {
      console.log(`\n🔍 Observations (${result.observations.length}):`);
      result.observations.forEach((obs, i) => {
        console.log(`\n  ${i + 1}. [${obs.type}] ${obs.title}`);
        console.log(`     ${obs.narrative}`);
        console.log(`     Concepts: ${obs.concepts.join(', ')}`);
        if (obs.files && obs.files.length > 0) {
          console.log(`     Files: ${obs.files.join(', ')}`);
        }
      });
    }
  } else {
    console.log('❌ Analysis failed or was skipped');
    process.exit(1);
  }
}

test().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
