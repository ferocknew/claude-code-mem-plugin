#!/usr/bin/env python3
"""
Claude Code Memory Plugin - MCP 客户端
本地版本：通过 mem.jsonl 文件记录对话内容
参考：https://github.com/modelcontextprotocol/servers/tree/main/src/memory
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastmcp import FastMCP
import uuid

# 数据文件路径
DATA_DIR = Path.home() / ".claude-code-mem"
MEMORY_FILE = DATA_DIR / "mem.jsonl"

# 确保数据目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 创建 FastMCP 应用
mcp = FastMCP(
    name="Claude Code Memory Plugin",
    instructions="这是一个用于记录和管理 Claude Code 对话内容的记忆插件。数据保存在本地 mem.jsonl 文件中。",
)


def append_to_memory(record: dict):
    """追加记录到 mem.jsonl 文件"""
    with open(MEMORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_memory() -> List[Dict[str, Any]]:
    """读取所有记录"""
    if not MEMORY_FILE.exists():
        return []

    records = []
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return records


def save_memory(records: List[Dict[str, Any]]):
    """保存所有记录到文件"""
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


@mcp.tool()
async def create_entities(entities: List[Dict[str, str]]) -> str:
    """创建一个或多个实体（记忆条目）

    Args:
        entities: 实体列表，每个实体包含 name, entityType, observations

    Example:
        entities = [
            {
                "name": "用户偏好",
                "entityType": "preference",
                "observations": ["喜欢使用 Python", "偏好简洁的代码"]
            }
        ]
    """
    created = []
    for entity in entities:
        record = {
            "id": str(uuid.uuid4()),
            "type": "entity",
            "name": entity.get("name", ""),
            "entityType": entity.get("entityType", "general"),
            "observations": entity.get("observations", []),
            "timestamp": datetime.utcnow().isoformat()
        }
        append_to_memory(record)
        created.append(record["id"])

    return json.dumps({
        "status": "success",
        "created": len(created),
        "ids": created
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def create_relations(relations: List[Dict[str, str]]) -> str:
    """创建实体之间的关系

    Args:
        relations: 关系列表，每个关系包含 from, to, relationType

    Example:
        relations = [
            {
                "from": "entity_id_1",
                "to": "entity_id_2",
                "relationType": "relates_to"
            }
        ]
    """
    created = []
    for relation in relations:
        record = {
            "id": str(uuid.uuid4()),
            "type": "relation",
            "from": relation.get("from", ""),
            "to": relation.get("to", ""),
            "relationType": relation.get("relationType", "relates_to"),
            "timestamp": datetime.utcnow().isoformat()
        }
        append_to_memory(record)
        created.append(record["id"])

    return json.dumps({
        "status": "success",
        "created": len(created),
        "ids": created
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def add_observations(observations: List[Dict[str, Any]]) -> str:
    """为现有实体添加观察记录

    Args:
        observations: 观察列表，每个包含 entityName, contents

    Example:
        observations = [
            {
                "entityName": "用户偏好",
                "contents": ["今天学习了 FastMCP", "完成了插件开发"]
            }
        ]
    """
    added = []
    for obs in observations:
        record = {
            "id": str(uuid.uuid4()),
            "type": "observation",
            "entityName": obs.get("entityName", ""),
            "contents": obs.get("contents", []),
            "timestamp": datetime.utcnow().isoformat()
        }
        append_to_memory(record)
        added.append(record["id"])

    return json.dumps({
        "status": "success",
        "added": len(added),
        "ids": added
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def delete_entities(entityNames: List[str]) -> str:
    """删除指定名称的实体及其相关观察记录

    Args:
        entityNames: 要删除的实体名称列表
    """
    records = read_memory()
    names_set = set(entityNames)

    # 删除匹配的实体和观察
    filtered = [
        r for r in records
        if not (
            (r.get("type") == "entity" and r.get("name") in names_set) or
            (r.get("type") == "observation" and r.get("entityName") in names_set)
        )
    ]

    deleted_count = len(records) - len(filtered)
    save_memory(filtered)

    return json.dumps({
        "status": "success",
        "deleted": deleted_count
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def delete_observations(
    entityName: str,
    observationContents: Optional[List[str]] = None
) -> str:
    """删除实体的特定观察记录

    Args:
        entityName: 实体名称
        observationContents: 要删除的观察内容列表（可选，为空则删除该实体的所有观察）
    """
    records = read_memory()

    if observationContents:
        contents_set = set(observationContents)
        filtered = []
        deleted_count = 0

        for r in records:
            if r.get("type") == "observation" and r.get("entityName") == entityName:
                # 过滤掉匹配的内容
                new_contents = [c for c in r.get("contents", []) if c not in contents_set]
                if new_contents:
                    r["contents"] = new_contents
                    filtered.append(r)
                    deleted_count += len(r.get("contents", [])) - len(new_contents)
                else:
                    deleted_count += len(r.get("contents", []))
            else:
                filtered.append(r)
    else:
        # 删除该实体的所有观察
        filtered = [
            r for r in records
            if not (r.get("type") == "observation" and r.get("entityName") == entityName)
        ]
        deleted_count = len(records) - len(filtered)

    save_memory(filtered)

    return json.dumps({
        "status": "success",
        "deleted": deleted_count
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def delete_relations(relations: List[Dict[str, str]]) -> str:
    """删除实体之间的关系

    Args:
        relations: 要删除的关系列表，每个包含 from, to, relationType
    """
    records = read_memory()

    # 构建要删除的关系集合
    to_delete = set()
    for rel in relations:
        key = (rel.get("from"), rel.get("to"), rel.get("relationType"))
        to_delete.add(key)

    # 过滤掉匹配的关系
    filtered = [
        r for r in records
        if not (
            r.get("type") == "relation" and
            (r.get("from"), r.get("to"), r.get("relationType")) in to_delete
        )
    ]

    deleted_count = len(records) - len(filtered)
    save_memory(filtered)

    return json.dumps({
        "status": "success",
        "deleted": deleted_count
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def read_graph() -> str:
    """读取整个知识图谱，返回所有实体、关系和观察

    返回结构：
    {
        "entities": [...],
        "relations": [...],
        "observations": [...]
    }
    """
    records = read_memory()

    entities = [r for r in records if r.get("type") == "entity"]
    relations = [r for r in records if r.get("type") == "relation"]
    observations = [r for r in records if r.get("type") == "observation"]

    return json.dumps({
        "entities": entities,
        "relations": relations,
        "observations": observations,
        "total": len(records)
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def search_nodes(query: str) -> str:
    """搜索包含指定关键词的实体和观察

    Args:
        query: 搜索关键词
    """
    records = read_memory()
    query_lower = query.lower()

    results = {
        "entities": [],
        "observations": []
    }

    for r in records:
        if r.get("type") == "entity":
            # 搜索实体名称和观察内容
            if query_lower in r.get("name", "").lower():
                results["entities"].append(r)
            elif any(query_lower in obs.lower() for obs in r.get("observations", [])):
                results["entities"].append(r)

        elif r.get("type") == "observation":
            # 搜索观察内容
            if any(query_lower in content.lower() for content in r.get("contents", [])):
                results["observations"].append(r)

    return json.dumps({
        "query": query,
        "found_entities": len(results["entities"]),
        "found_observations": len(results["observations"]),
        "results": results
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def open_nodes(names: List[str]) -> str:
    """获取指定名称的实体详细信息

    Args:
        names: 实体名称列表
    """
    records = read_memory()
    names_set = set(names)

    entities = [r for r in records if r.get("type") == "entity" and r.get("name") in names_set]
    observations = [r for r in records if r.get("type") == "observation" and r.get("entityName") in names_set]

    return json.dumps({
        "entities": entities,
        "observations": observations
    }, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    # 运行 MCP 服务器
    mcp.run()


def main():
    """入口点函数，供 uvx 调用"""
    mcp.run()
