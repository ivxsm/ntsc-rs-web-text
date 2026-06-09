import style from './style.module.scss';

import {useAppState, DateTimePosition} from '../../app-state';
import {CheckboxToggle, Dropdown, TextBox} from '../Widgets/Widgets';
import {SliderWithSpinBox} from '../SettingsList/SettingsList';

const positionOptions: {id: DateTimePosition, name: string}[] = [
    {id: 'bottom-right', name: 'Bottom Right'},
    {id: 'bottom-left', name: 'Bottom Left'},
];

const VhsDateTimePane = () => {
    const {vhsDateTimeEnabled, vhsDateTimePosition, vhsDateTimeUseCustom, vhsCustomDate, vhsDateTimeSize} = useAppState();

    return (
        <div className={style.dateTimePane}>
            <div className={style.dateTimeSettings}>
                <CheckboxToggle label="Enable VHS date" checked={vhsDateTimeEnabled} />
                <div className={style.setting}>
                    <Dropdown value={vhsDateTimePosition} options={positionOptions} />
                    <div className={style.settingLabel}>Position</div>
                </div>
                <div className={style.setting}>
                    <SliderWithSpinBox
                        value={vhsDateTimeSize}
                        min={10}
                        max={80}
                        step={1}
                    />
                    <div className={style.settingLabel}>Size</div>
                </div>
                <CheckboxToggle label="Use custom date" checked={vhsDateTimeUseCustom} />
                {vhsDateTimeUseCustom.value && <>
                    <div className={style.setting}>
                        <TextBox value={vhsCustomDate} type="date" disabled={!vhsDateTimeEnabled.value} />
                        <div className={style.settingLabel}>Date</div>
                    </div>
                </>}
            </div>
        </div>
    );
};

export default VhsDateTimePane;
