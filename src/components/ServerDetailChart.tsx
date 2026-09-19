import { Card, CardContent } from "@/components/ui/card"
import { ChartConfig, ChartContainer } from "@/components/ui/chart"
import { useWebSocketContext } from "@/hooks/use-websocket-context"
import { formatBytes } from "@/lib/format"
import { fetchResourceMetrics, ResourcePoint } from "@/lib/nezha-api"
import { cn, formatNezhaInfo, formatRelativeTime, formatTime } from "@/lib/utils"
import { NezhaServer, NezhaWebsocketResponse } from "@/types/nezha-api"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ServerDetailChartLoading } from "./loading/ServerDetailLoading"
import AnimatedCircularProgressBar from "./ui/animated-circular-progress-bar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

type cpuChartData = {
  timeStamp: string
  cpu: number
}

type processChartData = {
  timeStamp: string
  process: number
}

type diskChartData = {
  timeStamp: string
  disk: number
}

type memChartData = {
  timeStamp: string
  mem: number
  swap: number
}

type networkChartData = {
  timeStamp: string
  upload: number
  download: number
}

type connectChartData = {
  timeStamp: string
  tcp: number
  udp: number
}

const TIME_OPTIONS = [
  { value: "0", label: "实时" },
  { value: "1", label: "1h" },
  { value: "6", label: "6h" },
  { value: "12", label: "12h" },
  { value: "24", label: "24h" },
  { value: "72", label: "3d" },
  { value: "168", label: "7d" },
  { value: "720", label: "30d" },
]

export default function ServerDetailChart({ server_id }: { server_id: number }) {
  const { lastMessage, connected, messageHistory } = useWebSocketContext()
  const [hours, setHours] = useState(0)

  const { data: resourceHistory } = useQuery({
    queryKey: ["resourceMetrics", server_id, hours],
    queryFn: () => fetchResourceMetrics(server_id, hours),
    enabled: hours > 0,
    placeholderData: keepPreviousData,
    refetchInterval: hours > 0 ? (hours <= 24 ? 10000 : 60000) : false,
  })

  if (!connected && !lastMessage) {
    return <ServerDetailChartLoading />
  }

  const nezhaWsData = lastMessage ? (JSON.parse(lastMessage.data) as NezhaWebsocketResponse) : null

  if (!nezhaWsData) {
    return <ServerDetailChartLoading />
  }

  const server = nezhaWsData.servers.find((s) => s.id === server_id)

  if (!server) {
    return <ServerDetailChartLoading />
  }

  const h = hours > 0 ? resourceHistory : undefined

  return (
    <>
      <div className="flex justify-end mb-2">
        <Select value={hours.toString()} onValueChange={(v) => setHours(Number(v))}>
          <SelectTrigger className="h-7 w-[90px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <section className="grid md:grid-cols-2 lg:grid-cols-3 grid-cols-1 gap-3 server-charts">
        <CpuChart now={nezhaWsData.now} data={server} messageHistory={messageHistory} historyData={h?.["cpu.usage"]} />
        <ProcessChart now={nezhaWsData.now} data={server} messageHistory={messageHistory} historyData={h?.["process.count"]} />
        <DiskChart now={nezhaWsData.now} data={server} messageHistory={messageHistory} historyData={h?.["disk.used"]} />
        <MemChart
          now={nezhaWsData.now}
          data={server}
          messageHistory={messageHistory}
          historyMem={h?.["memory.used"]}
          historySwap={h?.["swap.used"]}
        />
        <NetworkChart
          now={nezhaWsData.now}
          data={server}
          messageHistory={messageHistory}
          historyUp={h?.["net.out.rate"]}
          historyDown={h?.["net.in.rate"]}
        />
        <ConnectChart
          now={nezhaWsData.now}
          data={server}
          messageHistory={messageHistory}
          historyTcp={h?.["connections.tcp"]}
          historyUdp={h?.["connections.udp"]}
        />
      </section>
    </>
  )
}

function CpuChart({
  now,
  data,
  messageHistory,
  historyData,
}: {
  now: number
  data: NezhaServer
  messageHistory: { data: string }[]
  historyData?: ResourcePoint[]
}) {
  const [cpuChartData, setCpuChartData] = useState<cpuChartData[]>([])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const { cpu } = formatNezhaInfo(now, data)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  // 初始化历史数据
  useEffect(() => {
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { cpu } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            cpu: cpu,
          }
        })
        .filter((item): item is cpuChartData => item !== null)
        .reverse() // 保持时间顺序

      setCpuChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [messageHistory])

  // 更新实时数据
  useEffect(() => {
    if (data && historyLoaded) {
      const timestamp = Date.now().toString()
      setCpuChartData((prevData) => {
        let newData = [] as cpuChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, cpu: cpu },
            { timeStamp: timestamp, cpu: cpu },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, cpu: cpu }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [data, historyLoaded])

  const chartConfig = {
    cpu: {
      label: "CPU",
    },
  } satisfies ChartConfig

  const chartData = historyData ? historyData.map((p) => ({ timeStamp: p.created_at.toString(), cpu: p.value })) : cpuChartData

  return (
    <Card
      className={cn({
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium">CPU</p>
            <section className="flex items-center gap-2">
              <p className="text-xs text-end w-10 font-medium">{cpu.toFixed(2)}%</p>
              <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={cpu} primaryColor="hsl(var(--chart-1))" />
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => (historyData ? formatTime(Number(value)) : formatRelativeTime(value))}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <Area isAnimationActive={false} dataKey="cpu" type="step" fill="hsl(var(--chart-1))" fillOpacity={0.3} stroke="hsl(var(--chart-1))" />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function ProcessChart({
  now,
  data,
  messageHistory,
  historyData,
}: {
  now: number
  data: NezhaServer
  messageHistory: { data: string }[]
  historyData?: ResourcePoint[]
}) {
  const { t } = useTranslation()
  const [processChartData, setProcessChartData] = useState([] as processChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { process } = formatNezhaInfo(now, data)

  // 初始化历史数据
  useEffect(() => {
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { process } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            process,
          }
        })
        .filter((item): item is processChartData => item !== null)
        .reverse()

      setProcessChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (data && historyLoaded) {
      const timestamp = Date.now().toString()
      setProcessChartData((prevData) => {
        let newData = [] as processChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, process },
            { timeStamp: timestamp, process },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, process }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [data, historyLoaded])

  const chartConfig = {
    process: {
      label: "Process",
    },
  } satisfies ChartConfig

  const chartData = historyData ? historyData.map((p) => ({ timeStamp: p.created_at.toString(), process: p.value })) : processChartData

  return (
    <Card
      className={cn({
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium">{t("serverDetailChart.process")}</p>
            <section className="flex items-center gap-2">
              <p className="text-xs text-end w-10 font-medium">{process}</p>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => (historyData ? formatTime(Number(value)) : formatRelativeTime(value))}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} />
              <Area
                isAnimationActive={false}
                dataKey="process"
                type="step"
                fill="hsl(var(--chart-2))"
                fillOpacity={0.3}
                stroke="hsl(var(--chart-2))"
              />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function MemChart({
  now,
  data,
  messageHistory,
  historyMem,
  historySwap,
}: {
  now: number
  data: NezhaServer
  messageHistory: { data: string }[]
  historyMem?: ResourcePoint[]
  historySwap?: ResourcePoint[]
}) {
  const { t } = useTranslation()
  const [memChartData, setMemChartData] = useState([] as memChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { mem, swap } = formatNezhaInfo(now, data)

  // 初始化历史数据
  useEffect(() => {
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { mem, swap } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            mem,
            swap,
          }
        })
        .filter((item): item is memChartData => item !== null)
        .reverse()

      setMemChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (data && historyLoaded) {
      const timestamp = Date.now().toString()
      setMemChartData((prevData) => {
        let newData = [] as memChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, mem, swap },
            { timeStamp: timestamp, mem, swap },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, mem, swap }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [data, historyLoaded])

  const chartConfig = {
    mem: {
      label: "Mem",
    },
    swap: {
      label: "Swap",
    },
  } satisfies ChartConfig

  const chartData =
    historyMem && historySwap
      ? historyMem.map((p, i) => ({
          timeStamp: p.created_at.toString(),
          mem: data.host.mem_total ? (p.value / data.host.mem_total) * 100 : 0,
          swap: data.host.swap_total && historySwap[i] ? (historySwap[i].value / data.host.swap_total) * 100 : 0,
        }))
      : memChartData

  return (
    <Card
      className={cn({
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <section className="flex items-center gap-4">
              <div className="flex flex-col">
                <p className=" text-xs text-muted-foreground">{t("serverDetailChart.mem")}</p>
                <div className="flex items-center gap-2">
                  <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={mem} primaryColor="hsl(var(--chart-8))" />
                  <p className="text-xs font-medium">{mem.toFixed(0)}%</p>
                </div>
              </div>
              <div className="flex flex-col">
                <p className=" text-xs text-muted-foreground">{t("serverDetailChart.swap")}</p>
                <div className="flex items-center gap-2">
                  <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={swap} primaryColor="hsl(var(--chart-10))" />
                  <p className="text-xs font-medium">{swap.toFixed(0)}%</p>
                </div>
              </div>
            </section>
            <section className="flex flex-col items-end gap-0.5">
              <div className="flex text-[11px] font-medium items-center gap-2">
                {formatBytes(data.state.mem_used)} / {formatBytes(data.host.mem_total)}
              </div>
              <div className="flex text-[11px] font-medium items-center gap-2">
                {data.host.swap_total ? (
                  <>
                    swap: {formatBytes(data.state.swap_used)} / {formatBytes(data.host.swap_total)}
                  </>
                ) : (
                  <>no swap</>
                )}
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => (historyMem ? formatTime(Number(value)) : formatRelativeTime(value))}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <Area isAnimationActive={false} dataKey="mem" type="step" fill="hsl(var(--chart-8))" fillOpacity={0.3} stroke="hsl(var(--chart-8))" />
              <Area
                isAnimationActive={false}
                dataKey="swap"
                type="step"
                fill="hsl(var(--chart-10))"
                fillOpacity={0.3}
                stroke="hsl(var(--chart-10))"
              />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function DiskChart({
  now,
  data,
  messageHistory,
  historyData,
}: {
  now: number
  data: NezhaServer
  messageHistory: { data: string }[]
  historyData?: ResourcePoint[]
}) {
  const { t } = useTranslation()
  const [diskChartData, setDiskChartData] = useState([] as diskChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { disk } = formatNezhaInfo(now, data)

  // 初始化历史数据
  useEffect(() => {
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { disk } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            disk,
          }
        })
        .filter((item): item is diskChartData => item !== null)
        .reverse()

      setDiskChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (data && historyLoaded) {
      const timestamp = Date.now().toString()
      setDiskChartData((prevData) => {
        let newData = [] as diskChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, disk },
            { timeStamp: timestamp, disk },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, disk }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [data, historyLoaded])

  const chartConfig = {
    disk: {
      label: "Disk",
    },
  } satisfies ChartConfig

  const chartData = historyData
    ? historyData.map((p) => ({
        timeStamp: p.created_at.toString(),
        disk: data.host.disk_total ? (p.value / data.host.disk_total) * 100 : 0,
      }))
    : diskChartData

  return (
    <Card
      className={cn({
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium">{t("serverDetailChart.disk")}</p>
            <section className="flex flex-col items-end gap-0.5">
              <section className="flex items-center gap-2">
                <p className="text-xs text-end w-10 font-medium">{disk.toFixed(0)}%</p>
                <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={disk} primaryColor="hsl(var(--chart-5))" />
              </section>
              <div className="flex text-[11px] font-medium items-center gap-2">
                {formatBytes(data.state.disk_used)} / {formatBytes(data.host.disk_total)}
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => (historyData ? formatTime(Number(value)) : formatRelativeTime(value))}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <Area isAnimationActive={false} dataKey="disk" type="step" fill="hsl(var(--chart-5))" fillOpacity={0.3} stroke="hsl(var(--chart-5))" />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function NetworkChart({
  now,
  data,
  messageHistory,
  historyUp,
  historyDown,
}: {
  now: number
  data: NezhaServer
  messageHistory: { data: string }[]
  historyUp?: ResourcePoint[]
  historyDown?: ResourcePoint[]
}) {
  const { t } = useTranslation()
  const [networkChartData, setNetworkChartData] = useState([] as networkChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { up, down } = formatNezhaInfo(now, data)

  // 初始化历史数据
  useEffect(() => {
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { up, down } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            upload: up,
            download: down,
          }
        })
        .filter((item): item is networkChartData => item !== null)
        .reverse()

      setNetworkChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (data && historyLoaded) {
      const timestamp = Date.now().toString()
      setNetworkChartData((prevData) => {
        let newData = [] as networkChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, upload: up, download: down },
            { timeStamp: timestamp, upload: up, download: down },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, upload: up, download: down }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [data, historyLoaded])

  const chartData =
    historyUp && historyDown
      ? historyUp.map((p, i) => ({
          timeStamp: p.created_at.toString(),
          upload: p.value / 1024 / 1024,
          download: historyDown[i] ? historyDown[i].value / 1024 / 1024 : 0,
        }))
      : networkChartData

  let maxDownload = Math.max(...chartData.map((item) => item.download))
  maxDownload = Math.ceil(maxDownload)
  if (maxDownload < 1) {
    maxDownload = 1
  }

  const chartConfig = {
    upload: {
      label: "Upload",
    },
    download: {
      label: "Download",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn({
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center">
            <section className="flex items-center gap-4">
              <div className="flex flex-col w-20">
                <p className="text-xs text-muted-foreground">{t("serverDetailChart.upload")}</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-1))]"></span>
                  <p className="text-xs font-medium">
                    {up >= 1024 ? `${(up / 1024).toFixed(2)}G/s` : up >= 1 ? `${up.toFixed(2)}M/s` : `${(up * 1024).toFixed(2)}K/s`}
                  </p>
                </div>
              </div>
              <div className="flex flex-col w-20">
                <p className=" text-xs text-muted-foreground">{t("serverDetailChart.download")}</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-4))]"></span>
                  <p className="text-xs font-medium">
                    {down >= 1024 ? `${(down / 1024).toFixed(2)}G/s` : down >= 1 ? `${down.toFixed(2)}M/s` : `${(down * 1024).toFixed(2)}K/s`}
                  </p>
                </div>
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => (historyUp ? formatTime(Number(value)) : formatRelativeTime(value))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                mirror={true}
                tickMargin={-15}
                type="number"
                minTickGap={50}
                interval="preserveStartEnd"
                domain={[1, maxDownload]}
                tickFormatter={(value) => `${value.toFixed(0)}M/s`}
              />
              <Line isAnimationActive={false} dataKey="upload" type="linear" stroke="hsl(var(--chart-1))" strokeWidth={1} dot={false} />
              <Line isAnimationActive={false} dataKey="download" type="linear" stroke="hsl(var(--chart-4))" strokeWidth={1} dot={false} />
            </LineChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function ConnectChart({
  now,
  data,
  messageHistory,
  historyTcp,
  historyUdp,
}: {
  now: number
  data: NezhaServer
  messageHistory: { data: string }[]
  historyTcp?: ResourcePoint[]
  historyUdp?: ResourcePoint[]
}) {
  const [connectChartData, setConnectChartData] = useState([] as connectChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { tcp, udp } = formatNezhaInfo(now, data)

  // 初始化历史数据
  useEffect(() => {
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { tcp, udp } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            tcp,
            udp,
          }
        })
        .filter((item): item is connectChartData => item !== null)
        .reverse()

      setConnectChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (data && historyLoaded) {
      const timestamp = Date.now().toString()
      setConnectChartData((prevData) => {
        let newData = [] as connectChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, tcp, udp },
            { timeStamp: timestamp, tcp, udp },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, tcp, udp }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [data, historyLoaded])

  const chartConfig = {
    tcp: {
      label: "TCP",
    },
    udp: {
      label: "UDP",
    },
  } satisfies ChartConfig

  const chartData =
    historyTcp && historyUdp
      ? historyTcp.map((p, i) => ({
          timeStamp: p.created_at.toString(),
          tcp: p.value,
          udp: historyUdp[i] ? historyUdp[i].value : 0,
        }))
      : connectChartData

  return (
    <Card
      className={cn({
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center">
            <section className="flex items-center gap-4">
              <div className="flex flex-col w-12">
                <p className="text-xs text-muted-foreground">TCP</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-1))]"></span>
                  <p className="text-xs font-medium">{tcp}</p>
                </div>
              </div>
              <div className="flex flex-col w-12">
                <p className=" text-xs text-muted-foreground">UDP</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-4))]"></span>
                  <p className="text-xs font-medium">{udp}</p>
                </div>
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => (historyTcp ? formatTime(Number(value)) : formatRelativeTime(value))}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} type="number" interval="preserveStartEnd" />
              <Line isAnimationActive={false} dataKey="tcp" type="linear" stroke="hsl(var(--chart-1))" strokeWidth={1} dot={false} />
              <Line isAnimationActive={false} dataKey="udp" type="linear" stroke="hsl(var(--chart-4))" strokeWidth={1} dot={false} />
            </LineChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}
