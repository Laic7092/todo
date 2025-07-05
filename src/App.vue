<script setup lang="ts">
import { useTodoList, useSync } from "../silence/composables"
import { ref } from "vue"
const { todoList, add, update, remove, clear } = useTodoList()
const { myId, devices, reqOperates } = useSync()
const val = ref("")

const submit = () => {
  add(val.value).then(() => {
    val.value = ""
  })
}
</script>

<template>
  <div>
    <input v-model="val" />
    <button @click="submit">提交</button>
  </div>
  <ul>
    <li v-for="item in todoList">
      <input type="checkbox" :value="item.done" @change="update(item.id, { ...item, done: $event.target.checked })" />
      <input :value="item.text" @change="update(item.id, { ...item, text: $event.target.value })">
      <button @click="remove(item.id)">删除</button>
    </li>
  </ul>
  <hr>
  <div>
    <button @click="clear">清空数据库</button>
    <button @click="reqOperates">获取操作日志</button>
  </div>
  <div>我的ID：{{ myId }}</div>
  <div>
    网络列表
  </div>
  <ul v-for="device in devices" :key="device">
    <li>
      <div>{{ device }}</div>
    </li>
  </ul>
</template>

<style scoped></style>
