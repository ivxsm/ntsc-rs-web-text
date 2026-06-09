import style from './style.module.scss';

import {useAppState, DateTimeMode, DateTimePosition} from '../../app-state';
import {CheckboxToggle, Dropdown} from '../Widgets/Widgets';

const modeOptions: {id: DateTimeMode, name: string}[] = [
    {id: 'both', name: 'Date + Time'},
    {id: 'date-only', name: 'Date only'},
    {id: 'time-only', name: 'Time only'},
];

const positionOptions: {id: DateTimePosition, name: string}[] = [
    {id: 'bottom-right', name: 'Bottom Right'},
    {id: 'bottom-left', name: 'Bottom Left'},
];

const VhsDateTimePane = () => {
    const {vhsDateTimeEnabled, vhsDateTimeMode, vhsDateTimePosition} = useAppState();

    return (
        <div className={style.dateTimePane}>
            <div className={style.dateTimeSettings}>
                <CheckboxToggle label="Enable VHS date/time" checked={vhsDateTimeEnabled} />
                <div className={style.setting}>
                    <Dropdown value={vhsDateTimeMode} options={modeOptions} />
                    <div className={style.settingLabel}>Mode</div>
                </div>
                <div className={style.setting}>
                    <Dropdown value={vhsDateTimePosition} options={positionOptions} />
                    <div className={style.settingLabel}>Position</div>
                </div>
            </div>
        </div>
    );
};

export default VhsDateTimePane;
