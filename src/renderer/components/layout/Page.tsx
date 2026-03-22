import { Box, Flex, Title } from '@mantine/core'
import type { FC } from 'react'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import Divider from '../common/Divider'
import WindowControls from './WindowControls'

export type PageProps = {
  children?: React.ReactNode
  title: string | React.ReactNode
  left?: React.ReactNode
  right?: React.ReactNode
}

export const Page: FC<PageProps> = ({ children, title, left, right }) => {
  const isSmallScreen = useIsSmallScreen()
  return (
    <div className="flex flex-col h-full">
      <Flex h={54} align="center" px="sm" className="title-bar">
        {left}

        <Flex align="center" gap={'xxs'} flex={1} {...(isSmallScreen ? { justify: 'center', px: 'sm' } : {})}>
          {typeof title === 'string' ? (
            <Title order={4} fz={!isSmallScreen ? 20 : undefined} lineClamp={1}>
              {title}
            </Title>
          ) : (
            title
          )}
        </Flex>
        {right}
        <WindowControls className="-mr-3 ml-2" />
        {isSmallScreen && !right && <Box w={28} />}
      </Flex>

      <Divider />

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}

export default Page
