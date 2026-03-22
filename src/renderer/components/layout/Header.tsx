import { Flex, Title } from '@mantine/core'
import type { Session } from '@shared/types'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import Divider from '../common/Divider'
import Toolbar from './Toolbar'
import WindowControls from './WindowControls'

export default function Header(props: { session: Session }) {
  const isSmallScreen = useIsSmallScreen()
  const { session: currentSession } = props

  return (
    <>
      <Flex h={54} align="center" px="sm" className={'flex-none title-bar'}>
        <Flex align="center" gap={'xxs'} flex={1} {...(isSmallScreen ? { justify: 'center', px: 'sm' } : {})}>
          <Title order={4} fz={!isSmallScreen ? 20 : undefined} lineClamp={1}>
            {currentSession?.name}
          </Title>
        </Flex>

        <Toolbar sessionId={currentSession.id} />

        <WindowControls className="-mr-3 ml-2" />
      </Flex>

      <Divider />
    </>
  )
}
